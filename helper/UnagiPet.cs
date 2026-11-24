// UNAGI desktop companion (Windows). A tiny native process that draws Croagunk
// in small per-pixel-alpha topmost windows and lets him roam the whole screen.
//
// Built for low resource use:
//   * frames are rendered lazily, once, and cached as DIB sections
//   * ~20 fps only while moving; ~3 fps idle; ~1.5 fps asleep; nothing is
//     redrawn when the picture and position are unchanged
//   * no per-tick allocations on the hot path, no third-party dependencies
//
// Protocol (UTF-8 lines, TAB separated). The parent writes to our stdin:
//     say <TAB> sticky(0|1) <TAB> mood(alert|happy|none) <TAB> text
//     quit
// We write to stdout:  ready | click | menu
// If stdin closes (parent died) we exit.
//
// Compiled with the .NET Framework 4 csc.exe, so this file is C# 5.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using WinTimer = System.Windows.Forms.Timer;

namespace UnagiPet
{
    // ------------------------------------------------------------------
    // Win32
    // ------------------------------------------------------------------
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential)]
    struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
    [StructLayout(LayoutKind.Sequential)]
    struct BITMAPINFOHEADER
    {
        public int biSize, biWidth, biHeight;
        public short biPlanes, biBitCount;
        public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
    }

    static class Native
    {
        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
            IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")]
        public static extern IntPtr CreateDIBSection(IntPtr hdc, ref BITMAPINFOHEADER pbmi, uint usage,
            out IntPtr bits, IntPtr section, uint offset);
        [DllImport("kernel32.dll", EntryPoint = "RtlMoveMemory")]
        public static extern void CopyMemory(IntPtr dest, IntPtr src, UIntPtr count);
    }

    // ------------------------------------------------------------------
    // A pre-rendered, premultiplied-alpha frame living in a DIB section
    // ------------------------------------------------------------------
    sealed class Frame
    {
        public IntPtr Hbm;
        public int W, H;

        public static Frame FromBitmap(Bitmap bmp)
        {
            Frame f = new Frame();
            f.W = bmp.Width; f.H = bmp.Height;
            BitmapData d = bmp.LockBits(new Rectangle(0, 0, f.W, f.H), ImageLockMode.ReadOnly, PixelFormat.Format32bppPArgb);
            try
            {
                BITMAPINFOHEADER h = new BITMAPINFOHEADER();
                h.biSize = 40; h.biWidth = f.W; h.biHeight = -f.H; h.biPlanes = 1; h.biBitCount = 32;
                IntPtr bits;
                f.Hbm = Native.CreateDIBSection(IntPtr.Zero, ref h, 0, out bits, IntPtr.Zero, 0);
                Native.CopyMemory(bits, d.Scan0, (UIntPtr)(uint)(f.W * f.H * 4));
            }
            finally { bmp.UnlockBits(d); }
            return f;
        }

        public void Free() { if (Hbm != IntPtr.Zero) { Native.DeleteObject(Hbm); Hbm = IntPtr.Zero; } }
    }

    // ------------------------------------------------------------------
    // A small click-able, non-activating, topmost layered window
    // ------------------------------------------------------------------
    sealed class Layer : Form
    {
        IntPtr memDc = IntPtr.Zero;
        Frame last;
        int lastX = int.MinValue, lastY = int.MinValue;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= 0x00080000 | 0x00000080 | 0x00000008 | 0x08000000; // LAYERED|TOOLWINDOW|TOPMOST|NOACTIVATE
                return cp;
            }
        }
        protected override bool ShowWithoutActivation { get { return true; } }

        public Layer()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-32000, -32000);
            Size = new Size(1, 1);
        }

        public void Present(Frame f, int x, int y)
        {
            if (f == null || !IsHandleCreated) return;
            if (f == last && x == lastX && y == lastY) return;
            IntPtr screenDc = Native.GetDC(IntPtr.Zero);
            if (memDc == IntPtr.Zero) memDc = Native.CreateCompatibleDC(screenDc);
            IntPtr old = Native.SelectObject(memDc, f.Hbm);
            POINT dst = new POINT(); dst.x = x; dst.y = y;
            SIZE sz = new SIZE(); sz.cx = f.W; sz.cy = f.H;
            POINT src = new POINT();
            BLENDFUNCTION bf = new BLENDFUNCTION(); bf.BlendOp = 0; bf.SourceConstantAlpha = 255; bf.AlphaFormat = 1;
            Native.UpdateLayeredWindow(Handle, screenDc, ref dst, ref sz, memDc, ref src, 0, ref bf, 2);
            Native.SelectObject(memDc, old);
            Native.ReleaseDC(IntPtr.Zero, screenDc);
            last = f; lastX = x; lastY = y;
        }

        public void Forget() { last = null; }
    }

    // ------------------------------------------------------------------
    // Croagunk, drawn with GDI+ (a port of the SVG used in the webview)
    // ------------------------------------------------------------------
    struct Pose
    {
        public float Jump, Sy, Shake, Rot, LegA, LegB, ArmA, ArmB, Sac, Mouth;
        public bool Closed;
        public int Zzz; // 0 none, 1 one z, 2 two z
    }

    enum St { Idle, Walk, Sit, Sleep, Alert, Happy, Drag, Angry, Fall, Land }

    static class Art
    {
        static readonly Color Blue = ColorTranslator.FromHtml("#4e72ae");
        static readonly Color DarkBlue = ColorTranslator.FromHtml("#2f4a7d");
        static readonly Color ArmBlue = ColorTranslator.FromHtml("#3d5f9b");
        static readonly Color Cream = ColorTranslator.FromHtml("#efe7cc");
        static readonly Color Navy = ColorTranslator.FromHtml("#1d2a47");
        static readonly Color Eye = ColorTranslator.FromHtml("#f6efb0");
        static readonly Color Sac = ColorTranslator.FromHtml("#e8553d");
        static readonly Color SacHi = ColorTranslator.FromHtml("#ff9a86");

        public static int FrameCount(St s)
        {
            switch (s)
            {
                case St.Walk: return 4;
                case St.Happy: return 4;
                case St.Sit: return 1;
                default: return 2;
            }
        }

        public static double FrameSeconds(St s)
        {
            switch (s)
            {
                case St.Walk: return 0.12;
                case St.Alert: return 0.14;
                case St.Happy: return 0.16;
                case St.Drag: return 0.25;
                case St.Sleep: return 1.4;
                default: return 1.3;
            }
        }

        public static Pose GetPose(St s, int f)
        {
            Pose p = new Pose();
            p.Sy = 1; p.Sac = 1; p.Mouth = 1.6f;
            switch (s)
            {
                case St.Idle:
                    p.Sy = f == 0 ? 1f : 0.965f; p.Sac = f == 0 ? 1f : 1.12f; break;
                case St.Walk:
                    {
                        double t = f / 4.0 * Math.PI * 2;
                        float sn = (float)Math.Sin(t);
                        p.LegA = 22 * sn; p.LegB = -22 * sn; p.ArmA = -22 * sn; p.ArmB = 22 * sn;
                        p.Jump = 3.5f * Math.Abs(sn);
                        break;
                    }
                case St.Alert:
                    p.Shake = f == 0 ? -1.5f : 1.5f; p.Rot = f == 0 ? -2 : 2;
                    p.Sac = f == 0 ? 1.25f : 1.4f; p.ArmA = 150; p.Mouth = 2.2f; break;
                case St.Happy:
                    {
                        float[] j = { 0, 9, 14, 6 };
                        p.Jump = j[f]; p.Sy = f == 0 ? 0.92f : 1.04f;
                        p.ArmA = 160; p.ArmB = -160; break;
                    }
                case St.Sit:
                    p.Sy = 0.9f; p.LegA = 80; p.LegB = -80; break;
                case St.Sleep:
                    p.Sy = f == 0 ? 0.88f : 0.85f; p.Closed = true; p.Zzz = f == 0 ? 1 : 2; break;
                case St.Drag:
                    p.Rot = f == 0 ? -7 : 7; p.LegA = 8; p.LegB = -8; break;
            }
            return p;
        }

        static void Rot(Graphics g, float cx, float cy, float deg)
        {
            g.TranslateTransform(cx, cy); g.RotateTransform(deg); g.TranslateTransform(-cx, -cy);
        }

        static GraphicsPath Round(float x, float y, float w, float h, float r)
        {
            GraphicsPath gp = new GraphicsPath();
            float d = r * 2;
            gp.AddArc(x, y, d, d, 180, 90); gp.AddArc(x + w - d, y, d, d, 270, 90);
            gp.AddArc(x + w - d, y + h - d, d, d, 0, 90); gp.AddArc(x, y + h - d, d, d, 90, 90);
            gp.CloseFigure();
            return gp;
        }

        static void Quad(GraphicsPath gp, float x0, float y0, float cx, float cy, float x1, float y1)
        {
            gp.AddBezier(x0, y0, x0 + 2f / 3f * (cx - x0), y0 + 2f / 3f * (cy - y0),
                x1 + 2f / 3f * (cx - x1), y1 + 2f / 3f * (cy - y1), x1, y1);
        }

        // Canvas = 64 x 80 units: 16 units of head-room for jumping.
        public static Bitmap Render(Pose p, float s, bool faceLeft)
        {
            int W = (int)Math.Ceiling(64 * s), H = (int)Math.Ceiling(80 * s);
            Bitmap bmp = new Bitmap(W, H, PixelFormat.Format32bppPArgb);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
                g.Clear(Color.Transparent);
                if (faceLeft) { g.TranslateTransform(W, 0); g.ScaleTransform(-1, 1); }
                g.TranslateTransform(0, 16 * s);
                g.ScaleTransform(s, s);

                using (SolidBrush sh = new SolidBrush(Color.FromArgb(70, 0, 0, 0)))
                    g.FillEllipse(sh, 17, 58, 30, 6);

                // body group pivots on the feet
                g.TranslateTransform(p.Shake, -p.Jump);
                g.TranslateTransform(32, 61); g.RotateTransform(p.Rot); g.ScaleTransform(1, p.Sy); g.TranslateTransform(-32, -61);

                using (SolidBrush dk = new SolidBrush(DarkBlue))
                {
                    GraphicsState st = g.Save(); Rot(g, 25, 51, p.LegA);
                    using (GraphicsPath lp = Round(20, 50, 10, 11, 4.5f)) g.FillPath(dk, lp);
                    g.Restore(st);
                    st = g.Save(); Rot(g, 39, 51, p.LegB);
                    using (GraphicsPath lp = Round(34, 50, 10, 11, 4.5f)) g.FillPath(dk, lp);
                    g.Restore(st);
                }

                using (SolidBrush b = new SolidBrush(Blue)) g.FillEllipse(b, 17, 29, 30, 26);
                using (SolidBrush b = new SolidBrush(Cream)) g.FillEllipse(b, 23, 36, 18, 18);

                using (SolidBrush ab = new SolidBrush(ArmBlue))
                using (SolidBrush cr = new SolidBrush(Cream))
                {
                    GraphicsState st = g.Save(); Rot(g, 15, 36, p.ArmA);
                    g.FillEllipse(ab, 11, 35.5f, 8, 15); g.FillEllipse(cr, 11.8f, 46.8f, 6.4f, 6.4f);
                    g.Restore(st);
                    st = g.Save(); Rot(g, 49, 36, p.ArmB);
                    g.FillEllipse(ab, 45, 35.5f, 8, 15); g.FillEllipse(cr, 45.8f, 46.8f, 6.4f, 6.4f);
                    g.Restore(st);
                }

                // head
                using (SolidBrush b = new SolidBrush(Blue)) g.FillEllipse(b, 13, 10, 38, 28);
                using (GraphicsPath mask = new GraphicsPath())
                {
                    Quad(mask, 13.5f, 22, 32, 9, 50.5f, 22);
                    Quad(mask, 50.5f, 22, 50, 30, 42, 28);
                    Quad(mask, 42, 28, 32, 25, 22, 28);
                    Quad(mask, 22, 28, 14, 30, 13.5f, 22);
                    mask.CloseFigure();
                    using (SolidBrush b = new SolidBrush(Navy)) g.FillPath(b, mask);
                }

                if (!p.Closed)
                {
                    using (SolidBrush eb = new SolidBrush(Eye))
                    using (SolidBrush pb = new SolidBrush(Color.FromArgb(22, 22, 22)))
                    {
                        g.FillEllipse(eb, 19.8f, 18.4f, 8.4f, 7.2f); g.FillEllipse(pb, 23.3f, 20.4f, 3.8f, 3.8f);
                        g.FillEllipse(eb, 35.8f, 18.4f, 8.4f, 7.2f); g.FillEllipse(pb, 36.9f, 20.4f, 3.8f, 3.8f);
                    }
                }
                else
                {
                    using (Pen lid = new Pen(Eye, 1.6f))
                    using (GraphicsPath l1 = new GraphicsPath())
                    using (GraphicsPath l2 = new GraphicsPath())
                    {
                        lid.StartCap = LineCap.Round; lid.EndCap = LineCap.Round;
                        Quad(l1, 20, 22.5f, 24, 25, 28, 22.5f); Quad(l2, 36, 22.5f, 40, 25, 44, 22.5f);
                        g.DrawPath(lid, l1); g.DrawPath(lid, l2);
                    }
                }

                using (SolidBrush sb = new SolidBrush(Sac))
                {
                    float r = 6.2f * p.Sac;
                    g.FillEllipse(sb, 14 - r, 30 - r, r * 2, r * 2);
                    g.FillEllipse(sb, 50 - r, 30 - r, r * 2, r * 2);
                }
                using (SolidBrush hb = new SolidBrush(SacHi))
                {
                    g.FillEllipse(hb, 10.7f, 26.6f, 3.2f, 3.2f); g.FillEllipse(hb, 46.7f, 26.6f, 3.2f, 3.2f);
                }
                using (Pen mp = new Pen(Navy, p.Mouth))
                using (GraphicsPath mg = new GraphicsPath())
                {
                    mp.StartCap = LineCap.Round; mp.EndCap = LineCap.Round;
                    Quad(mg, 24, 32.5f, 32, 37.5f, 40, 32.5f);
                    g.DrawPath(mp, mg);
                }

                g.ResetTransform();
                if (p.Zzz > 0)
                {
                    g.TranslateTransform(0, 16 * s); g.ScaleTransform(s, s);
                    using (Font zf = new Font("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (SolidBrush zb = new SolidBrush(Color.FromArgb(230, 159, 180, 224)))
                    {
                        // drawn unmirrored so the letters always read correctly
                        g.DrawString("z", zf, zb, 46, 2);
                        if (p.Zzz > 1) g.DrawString("z", zf, zb, 53, -6);
                    }
                }
            }
            return bmp;
        }
    }

    // ------------------------------------------------------------------
    // Speech bubble rendering
    // ------------------------------------------------------------------
    static class BubbleArt
    {
        public static Size Measure(string text, float s, out Font font)
        {
            font = new Font("Segoe UI", 12f * s, FontStyle.Regular, GraphicsUnit.Pixel);
            using (Bitmap tmp = new Bitmap(1, 1))
            using (Graphics g = Graphics.FromImage(tmp))
            {
                SizeF sz = g.MeasureString(text, font, (int)(190 * s), StringFormat.GenericDefault);
                return new Size((int)Math.Ceiling(sz.Width) + (int)(18 * s), (int)Math.Ceiling(sz.Height) + (int)(14 * s));
            }
        }

        // tailX: pixel offset of the tail's tip inside the bubble; up: tail on the top edge
        public static Bitmap Render(string text, Font font, Size box, float s, int tailX, bool up, bool sticky)
        {
            int tail = (int)(7 * s), W = box.Width, H = box.Height + tail;
            Bitmap bmp = new Bitmap(W, H, PixelFormat.Format32bppPArgb);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
                g.Clear(Color.Transparent);
                float top = up ? tail : 0;
                float r = 8 * s;
                float margin = r + 5 * s;
                float tx = Math.Max(margin, Math.Min(W - margin, tailX));
                using (GraphicsPath gp = new GraphicsPath())
                {
                    gp.AddPath(RoundRect(0.5f, top + 0.5f, W - 1, box.Height - 1, r), false);
                    using (SolidBrush fill = new SolidBrush(Color.FromArgb(245, 37, 37, 38)))
                    using (Pen pen = new Pen(sticky ? Color.FromArgb(245, 158, 11) : Color.FromArgb(120, 150, 150, 155), Math.Max(1f, s)))
                    {
                        g.FillPath(fill, gp); g.DrawPath(pen, gp);
                        PointF[] tri = up
                            ? new PointF[] { new PointF(tx - 5 * s, top + 0.5f), new PointF(tx, 0.5f), new PointF(tx + 5 * s, top + 0.5f) }
                            : new PointF[] { new PointF(tx - 5 * s, top + box.Height - 0.5f), new PointF(tx, H - 0.5f), new PointF(tx + 5 * s, top + box.Height - 0.5f) };
                        g.FillPolygon(fill, tri);
                        g.DrawLine(pen, tri[0], tri[1]); g.DrawLine(pen, tri[1], tri[2]);
                        using (Pen cover = new Pen(Color.FromArgb(245, 37, 37, 38), pen.Width + 1))
                            g.DrawLine(cover, tri[0].X + 1, tri[0].Y, tri[2].X - 1, tri[2].Y);
                    }
                }
                using (SolidBrush tb = new SolidBrush(Color.FromArgb(235, 204, 204, 204)))
                    g.DrawString(text, font, tb, new RectangleF(9 * s, top + 7 * s, W - 14 * s, box.Height), StringFormat.GenericDefault);
            }
            return bmp;
        }

        static GraphicsPath RoundRect(float x, float y, float w, float h, float r)
        {
            GraphicsPath gp = new GraphicsPath();
            float d = r * 2;
            gp.AddArc(x, y, d, d, 180, 90); gp.AddArc(x + w - d, y, d, d, 270, 90);
            gp.AddArc(x + w - d, y + h - d, d, d, 0, 90); gp.AddArc(x, y + h - d, d, d, 90, 90);
            gp.CloseFigure();
            return gp;
        }
    }


    // ------------------------------------------------------------------
    // How a character is drawn. VectorLook = Croagunk (GDI+ shapes);
    // SpriteLook = PNG strips described by the extension (see src/characters.ts).
    // ------------------------------------------------------------------
    abstract class Look
    {
        public int W, H;                 // window size in px
        public float HeadTop;            // px from window top to the top of the head (bubble anchor)
        public float FloorPad;           // px below the feet inside the window
        public float TopPad;             // transparent head-room at the top (may sit off-screen)
        public float WalkMin, WalkMax, RunSpeed;
        public abstract bool Has(St s);
        public abstract int Count(St s);
        public abstract double Seconds(St s);
        public abstract bool Loops(St s);
        public abstract Frame Get(St s, int f, bool left);
        public abstract void Free();
    }

    sealed class VectorLook : Look
    {
        readonly float s;
        readonly Dictionary<int, Frame> cache = new Dictionary<int, Frame>();

        public VectorLook(float dpi)
        {
            s = 72f / 64f * dpi;
            W = (int)Math.Ceiling(64 * s); H = (int)Math.Ceiling(80 * s);
            HeadTop = 24 * s; FloorPad = 12 * s; TopPad = 16 * s;
            WalkMin = 60 * s; WalkMax = 100 * s; RunSpeed = 260 * s;
        }

        static St Map(St st) { return st == St.Angry ? St.Alert : st; }
        public override bool Has(St st) { return st != St.Fall && st != St.Land; }
        public override int Count(St st) { return Art.FrameCount(Map(st)); }
        public override double Seconds(St st) { return Art.FrameSeconds(Map(st)); }
        public override bool Loops(St st) { return true; }

        public override Frame Get(St st, int f, bool left)
        {
            st = Map(st);
            int key = ((int)st * 8 + f) * 2 + (left ? 1 : 0);
            Frame fr;
            if (!cache.TryGetValue(key, out fr))
            {
                using (Bitmap b = Art.Render(Art.GetPose(st, f), s, left)) fr = Frame.FromBitmap(b);
                cache[key] = fr;
            }
            return fr;
        }

        public override void Free() { foreach (Frame f in cache.Values) f.Free(); cache.Clear(); }
    }

    sealed class AnimSpec { public string File; public int Frames, W, H, FrameMs; public bool Loop; }

    sealed class SpriteLook : Look
    {
        const int MaxSets = 4; // animation x direction sets kept in memory; the rest are rebuilt on demand
        readonly Dictionary<string, AnimSpec> anims;
        readonly bool facesRight;
        readonly float dpi;
        readonly Dictionary<string, Frame[]> sets = new Dictionary<string, Frame[]>();
        readonly List<string> lru = new List<string>();

        public SpriteLook(Dictionary<string, AnimSpec> a, bool facesRight, float dpi)
        {
            this.anims = a; this.facesRight = facesRight; this.dpi = dpi;
            AnimSpec idle = a["idle"];
            W = (int)Math.Ceiling(idle.W * dpi); H = (int)Math.Ceiling(idle.H * dpi);
            HeadTop = 0.05f * H; FloorPad = 0; TopPad = 0;   // sprites run edge to edge: feet touch the window bottom
            WalkMin = 75 * dpi; WalkMax = 95 * dpi; RunSpeed = 150 * dpi;
        }

        string Name(St s)
        {
            switch (s)
            {
                case St.Walk: return "walk";
                case St.Alert: return "alert";
                case St.Angry: return anims.ContainsKey("angry") ? "angry" : (anims.ContainsKey("alert") ? "alert" : "idle");
                case St.Happy: return anims.ContainsKey("happy") ? "happy" : "idle";
                case St.Drag: return anims.ContainsKey("drag") ? "drag" : "idle";
                case St.Fall: return "fall";
                case St.Land: return "land";
                case St.Sit: return anims.ContainsKey("sit") ? "sit" : "idle";
                case St.Sleep: return anims.ContainsKey("sleep") ? "sleep" : "idle";
                default: return "idle";
            }
        }

        public override bool Has(St s)
        {
            switch (s)
            {
                case St.Sit: return anims.ContainsKey("sit");
                case St.Sleep: return anims.ContainsKey("sleep");
                case St.Fall: return anims.ContainsKey("fall");
                case St.Land: return anims.ContainsKey("land");
                case St.Walk: return anims.ContainsKey("walk");
                default: return true;
            }
        }

        AnimSpec A(St s) { string n = Name(s); return anims.ContainsKey(n) ? anims[n] : anims["idle"]; }
        public override int Count(St s) { return Math.Max(1, A(s).Frames); }
        public override double Seconds(St s) { return Math.Max(20, A(s).FrameMs) / 1000.0; }
        public override bool Loops(St s) { return A(s).Loop; }

        public override Frame Get(St s, int f, bool left)
        {
            string name = anims.ContainsKey(Name(s)) ? Name(s) : "idle";
            bool flip = left == facesRight;                  // sprites are drawn facing `facing`
            string key = name + (flip ? "|f" : "|n");
            Frame[] set;
            if (!sets.TryGetValue(key, out set)) { set = Build(anims[name], flip); sets[key] = set; }
            lru.Remove(key); lru.Add(key);
            while (lru.Count > MaxSets)
            {
                string old = lru[0]; lru.RemoveAt(0);
                foreach (Frame fr in sets[old]) fr.Free();
                sets.Remove(old);
            }
            return set[Math.Min(f, set.Length - 1)];
        }

        Frame[] Build(AnimSpec a, bool flip)
        {
            int dw = (int)Math.Ceiling(a.W * dpi), dh = (int)Math.Ceiling(a.H * dpi);
            Frame[] frames = new Frame[Math.Max(1, a.Frames)];
            using (MemoryStream ms = new MemoryStream(File.ReadAllBytes(a.File)))
            using (Image strip = Image.FromStream(ms))
            using (ImageAttributes ia = new ImageAttributes())
            {
                ia.SetWrapMode(WrapMode.TileFlipXY); // no bleeding from neighbouring frames when scaling
                for (int k = 0; k < frames.Length; k++)
                {
                    using (Bitmap b = new Bitmap(dw, dh, PixelFormat.Format32bppPArgb))
                    using (Graphics g = Graphics.FromImage(b))
                    {
                        g.Clear(Color.Transparent);
                        g.InterpolationMode = dpi > 1.01f ? InterpolationMode.HighQualityBicubic : InterpolationMode.NearestNeighbor;
                        g.PixelOffsetMode = PixelOffsetMode.Half;
                        if (flip) { g.TranslateTransform(dw, 0); g.ScaleTransform(-1, 1); }
                        g.DrawImage(strip, new Rectangle(0, 0, dw, dh), k * a.W, 0, a.W, a.H, GraphicsUnit.Pixel, ia);
                        frames[k] = Frame.FromBitmap(b);
                    }
                }
            }
            return frames;
        }

        public override void Free()
        {
            foreach (Frame[] set in sets.Values) foreach (Frame f in set) f.Free();
            sets.Clear(); lru.Clear();
        }
    }

    // One user-supplied image (a photo cut-out), animated procedurally: bob, sway, hop, shake.
    sealed class PhotoLook : Look
    {
        readonly float dpi;
        readonly Bitmap img;                 // the photo, pre-scaled to its on-screen size
        readonly int iw, ih, side, top;      // image size and the transparent margins around it
        readonly Dictionary<int, Frame> cache = new Dictionary<int, Frame>();

        public PhotoLook(string file, int heightPx, float dpi)
        {
            this.dpi = dpi;
            using (MemoryStream ms = new MemoryStream(File.ReadAllBytes(file)))
            using (Image src = Image.FromStream(ms))
            {
                ih = Math.Max(16, (int)Math.Round(heightPx * dpi));
                iw = Math.Max(8, (int)Math.Round(src.Width * (double)ih / src.Height));
                img = new Bitmap(iw, ih, PixelFormat.Format32bppPArgb);
                using (Graphics g = Graphics.FromImage(img))
                {
                    g.Clear(Color.Transparent);
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    using (ImageAttributes ia = new ImageAttributes())
                    {
                        ia.SetWrapMode(WrapMode.TileFlipXY);
                        g.DrawImage(src, new Rectangle(0, 0, iw, ih), 0, 0, src.Width, src.Height, GraphicsUnit.Pixel, ia);
                    }
                }
            }
            side = (int)Math.Ceiling(iw * 0.14); top = (int)Math.Ceiling(16 * dpi);
            W = iw + side * 2; H = ih + top;
            HeadTop = top + 0.04f * ih; FloorPad = 0; TopPad = top;
            WalkMin = 75 * dpi; WalkMax = 95 * dpi; RunSpeed = 150 * dpi;
        }

        public override bool Has(St s) { return s != St.Sit && s != St.Sleep && s != St.Fall && s != St.Land; }

        public override int Count(St s)
        {
            switch (s) { case St.Walk: return 4; case St.Happy: return 4; default: return 2; }
        }

        public override double Seconds(St s)
        {
            switch (s)
            {
                case St.Walk: return 0.125;
                case St.Alert: return 0.14;
                case St.Angry: return 0.14;
                case St.Happy: return 0.16;
                case St.Drag: return 0.25;
                default: return 1.3;
            }
        }

        public override bool Loops(St s) { return true; }

        public override Frame Get(St s, int f, bool left)
        {
            if (s == St.Sit || s == St.Sleep || s == St.Fall || s == St.Land) s = St.Idle;
            int key = ((int)s * 8 + f) * 2 + (left ? 1 : 0);
            Frame fr;
            if (!cache.TryGetValue(key, out fr))
            {
                using (Bitmap b = RenderFrame(s, f, left)) fr = Frame.FromBitmap(b);
                cache[key] = fr;
            }
            return fr;
        }

        Bitmap RenderFrame(St s, int f, bool left)
        {
            float jump = 0, shake = 0, rot = 0, sx = 1, sy = 1;
            bool hang = false;
            switch (s)
            {
                case St.Idle: sy = f == 0 ? 1f : 0.985f; break;
                case St.Walk:
                    {
                        float sn = (float)Math.Sin(f / 4.0 * Math.PI * 2);
                        rot = 3 * sn; jump = 5 * dpi * Math.Abs(sn); break;
                    }
                case St.Alert: shake = (f == 0 ? -2f : 2f) * dpi; rot = f == 0 ? -2 : 2; break;
                case St.Angry: shake = (f == 0 ? -2f : 2f) * dpi; rot = f == 0 ? -1.5f : 1.5f; sx = sy = f == 0 ? 1.04f : 1.07f; break;
                case St.Happy:
                    {
                        float[] j = { 0, 9, 14, 6 };
                        jump = j[f] * dpi; sy = f == 0 ? 0.93f : 1.04f; sx = f == 0 ? 1.05f : 0.98f; break;
                    }
                case St.Drag: rot = f == 0 ? -8 : 8; hang = true; break;
            }

            Bitmap bmp = new Bitmap(W, H, PixelFormat.Format32bppPArgb);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBilinear;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.Clear(Color.Transparent);
                if (left) { g.TranslateTransform(W, 0); g.ScaleTransform(-1, 1); }
                float cx = W / 2f;
                float pivotY = hang ? top : top + ih;               // carried: hangs from the head; otherwise pivots on the feet
                g.TranslateTransform(shake, -jump);
                g.TranslateTransform(cx, pivotY); g.RotateTransform(rot); g.ScaleTransform(sx, sy); g.TranslateTransform(-cx, -pivotY);
                g.DrawImageUnscaled(img, side, top);
            }
            return bmp;
        }

        public override void Free()
        {
            foreach (Frame fr in cache.Values) fr.Free();
            cache.Clear();
            img.Dispose();
        }
    }

    // Character definition streamed from the extension (char / anim / image / lines / charend).
    sealed class CharSpec
    {
        public string Id = "croagunk", Kind = "vector";
        public string ImageFile; public int HeightPx = 130;
        public bool FacesRight = true;
        public Dictionary<string, AnimSpec> Anims = new Dictionary<string, AnimSpec>();
        public Dictionary<string, string[]> Lines = new Dictionary<string, string[]>();
    }

    // ------------------------------------------------------------------
    // The pet
    // ------------------------------------------------------------------
    sealed class Msg { public string Text; public bool Sticky; public string Mood; }

    sealed class PetApp : ApplicationContext
    {
        string[] petLines = { "Gunk!", "*puffs cheek sacs happily*", "Croa...", "Careful, my fingers are poisonous!" };
        string[] chatter = { "Unagi... stay aware.", "Hydrate, coder.", "Stretch those shoulders!" };

        readonly Random rnd = new Random();
        readonly Stopwatch sw = Stopwatch.StartNew();
        readonly Layer pet = new Layer();
        readonly Layer bubbleWin = new Layer();
        readonly WinTimer timer = new WinTimer();
        readonly Queue<Msg> queue = new Queue<Msg>();
        readonly float dpi;
        readonly float bs;      // bubble scale
        readonly StreamWriter outp;

        Look look;
        CharSpec pending;
        int W, H;
        bool ready;              // hold the first draw until the extension has told us which character to show

        St state = St.Idle;
        int frame;
        double frameAcc, last, nextThink = 4, stateUntil, bubbleUntil, pumpAt = -1;
        float x, y, tx, ty, speed;
        bool faceLeft = true, dragging, down, bubbleShown;
        float vy;
        bool floorOnly, dropping;   // floorOnly: walk left/right along the bottom of the screen; dropping: falling back to it
        int offX, offY, downX, downY;
        Msg cur;

        // bubble
        Font bFont; Size bBox; string bText; Frame bFrame; int bTail = -9999; bool bUp, bUpSet;
        int bx, by;

        public PetApp(StreamWriter output)
        {
            outp = output;
            using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) dpi = g.DpiX / 96f;
            bs = 72f / 64f * dpi;
            SetLook(new VectorLook(dpi));

            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            x = wa.Right - W - 20; y = FloorY(wa);
            pet.Show(); bubbleWin.Show(); bubbleWin.Hide();

            pet.MouseDown += OnDown; pet.MouseMove += OnMove; pet.MouseUp += OnUp;
            bubbleWin.MouseUp += delegate (object o, MouseEventArgs e) { if (e.Button == MouseButtons.Left) { Send("click"); Dismiss(); } };

            timer.Interval = 300;
            timer.Tick += delegate { Tick(); };
            timer.Start();
            Send("ready");
        }

        void Send(string line)
        {
            try { outp.WriteLine(line); } catch (Exception) { }
        }

        float FloorY(Rectangle wa) { return wa.Bottom - H + look.FloorPad; }

        void SetLook(Look next)
        {
            Look old = look;
            look = next; W = next.W; H = next.H;
            frame = 0; frameAcc = 0;
            pet.Forget();
            if (old != null) old.Free();
        }

        // ---- messages from the parent (called on the UI thread) ----
        public void Handle(string line)
        {
            if (line == null) return;
            if (line == "quit") { ExitThread(); return; }
            string[] p = line.Split('\t');
            switch (p[0])
            {
                case "say":
                    if (p.Length >= 4 && queue.Count <= 6)
                    {
                        Msg m = new Msg(); m.Sticky = p[1] == "1"; m.Mood = p[2]; m.Text = p[3];
                        queue.Enqueue(m);
                        Pump();
                    }
                    break;
                case "char":
                    pending = new CharSpec();
                    if (p.Length >= 4) { pending.Id = p[1]; pending.Kind = p[2]; pending.FacesRight = p[3] != "left"; }
                    if (p.Length >= 5) pending.HeightPx = Math.Max(60, Math.Min(300, ToInt(p[4])));
                    break;
                case "image":
                    if (pending != null && p.Length >= 2) pending.ImageFile = p[1];
                    break;
                case "anim":
                    if (pending != null && p.Length >= 8)
                    {
                        AnimSpec a = new AnimSpec();
                        a.File = p[2];
                        a.Frames = ToInt(p[3]); a.W = ToInt(p[4]); a.H = ToInt(p[5]); a.FrameMs = ToInt(p[6]); a.Loop = p[7] == "1";
                        pending.Anims[p[1]] = a;
                    }
                    break;
                case "lines":
                    if (pending != null && p.Length >= 3) pending.Lines[p[1]] = p[2].Split('\u001f');
                    break;
                case "mode":
                    if (p.Length >= 2)
                    {
                        bool floor = p[1] == "floor";
                        bool changed = floor != floorOnly;
                        floorOnly = floor;
                        if (changed && floorOnly && !dragging) { if (state == St.Walk) Enter(St.Idle); StartDrop(); }
                    }
                    break;
                case "charend":
                    if (pending != null) { ApplyCharacter(pending); pending = null; }
                    break;
            }
        }

        static int ToInt(string s)
        {
            int v; return int.TryParse(s, System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out v) ? v : 0;
        }

        void ApplyCharacter(CharSpec c)
        {
            Look next = null;
            if (c.Kind == "sprite" && c.Anims.ContainsKey("idle"))
            {
                try
                {
                    foreach (AnimSpec a in c.Anims.Values) if (!File.Exists(a.File)) throw new FileNotFoundException(a.File);
                    next = new SpriteLook(c.Anims, c.FacesRight, dpi);
                }
                catch (Exception) { next = null; }
            }
            else if (c.Kind == "photo" && c.ImageFile != null)
            {
                try { next = new PhotoLook(c.ImageFile, c.HeightPx, dpi); }
                catch (Exception) { next = null; }
            }
            if (next == null) next = new VectorLook(dpi);

            // keep the feet where they were when the window size changes
            float feet = y + H;
            SetLook(next);
            y = feet - H;
            Rectangle wa = Screen.FromPoint(new Point((int)(x + W / 2), (int)(y + H / 2))).WorkingArea;
            x = Math.Max(wa.Left, Math.Min(wa.Right - W, x));
            y = Math.Max(wa.Top - look.TopPad, Math.Min(FloorY(wa), y));
            state = St.Idle; dragging = false; down = false;

            string[] v;
            if (c.Lines.TryGetValue("pet", out v) && v.Length > 0) petLines = v;
            if (c.Lines.TryGetValue("chatter", out v) && v.Length > 0) chatter = v;
            ready = true;
            if (bubbleShown) { bFrame = null; bUpSet = false; }
            Draw();
        }

        // ---- speech ----
        void Pump()
        {
            if (cur != null || queue.Count == 0) return;
            cur = queue.Dequeue();
            if (state == St.Sleep) Enter(St.Idle);
            if (cur.Sticky && !dragging)
            {
                // Run over beside the cursor so the alert is noticed.
                Point c = Cursor.Position;
                Rectangle wa = Screen.FromPoint(c).WorkingArea;
                float px = c.X + (c.X > wa.Left + wa.Width / 2 ? -W - 60 * bs : 60 * bs);
                float py = floorOnly ? FloorY(wa) : c.Y - H * 0.6f;
                WalkTo(px, py, look.RunSpeed);
            }
            else ShowBubble();
        }

        void ShowBubble()
        {
            if (cur == null) return;
            double now = sw.Elapsed.TotalSeconds;
            if (bFont != null) bFont.Dispose();
            bText = cur.Text;
            bBox = BubbleArt.Measure(bText, bs, out bFont);
            bTail = -9999; bUpSet = false;
            bubbleShown = true;
            bubbleUntil = now + (cur.Sticky ? 14 : 4.5 + cur.Text.Length * 0.045);
            if (!dragging && state != St.Walk && state != St.Fall && state != St.Land)
                Enter(cur.Mood == "alert" ? St.Alert : cur.Mood == "angry" ? St.Angry : cur.Mood == "happy" ? St.Happy : St.Idle);
            PositionBubble();
        }

        void Dismiss()
        {
            double now = sw.Elapsed.TotalSeconds;
            cur = null; bubbleShown = false;
            bubbleWin.Hide();
            if (state == St.Alert || state == St.Happy || state == St.Angry) Enter(St.Idle);
            nextThink = now + 2.5; pumpAt = now + 0.35;
            Draw();
        }

        void PositionBubble()
        {
            if (!bubbleShown) return;
            Rectangle wa = Screen.FromPoint(new Point((int)(x + W / 2), (int)(y + H / 2))).WorkingArea;
            int tail = (int)(7 * bs);
            float petTop = y + look.HeadTop;
            bool above = petTop - (bBox.Height + tail) >= wa.Top; // else show it below the pet
            int bw = bBox.Width;
            int left = (int)(x + W / 2 - bw / 2);
            int clamped = Math.Max(wa.Left + 4, Math.Min(wa.Right - bw - 4, left));
            int tailX = (int)(x + W / 2) - clamped;
            bool tailUp = !above;                                 // tail on the top edge when below
            if (bFrame == null || tailX != bTail || !bUpSet || tailUp != bUp)
            {
                if (bFrame != null) bFrame.Free();
                using (Bitmap b = BubbleArt.Render(bText, bFont, bBox, bs, tailX, tailUp, cur != null && cur.Sticky))
                    bFrame = Frame.FromBitmap(b);
                bTail = tailX; bUp = tailUp; bUpSet = true;
                bubbleWin.Forget();
            }
            bx = clamped;
            by = above ? (int)(petTop - bFrame.H + 2 * bs) : (int)(y + H - 4 * bs);
            if (!bubbleWin.Visible) bubbleWin.Show();
            bubbleWin.Present(bFrame, bx, by);
        }

        // ---- state / movement ----
        void Enter(St next)
        {
            if (state == next) return;
            state = next; frame = 0; frameAcc = 0;
        }

        void WalkTo(float px, float py, float spd)
        {
            Rectangle wa = Screen.FromPoint(new Point((int)px, (int)py)).WorkingArea;
            tx = Math.Max(wa.Left, Math.Min(wa.Right - W, px));
            ty = floorOnly ? FloorY(wa) : Math.Max(wa.Top - look.TopPad, Math.Min(FloorY(wa), py));
            speed = spd;
            if (Math.Abs(tx - x) > 2) faceLeft = tx < x;
            Enter(St.Walk);
        }

        void Think(double now)
        {
            nextThink = now + 4 + rnd.NextDouble() * 6;
            Rectangle vs = Screen.FromPoint(new Point((int)(x + W / 2), (int)(y + H / 2))).WorkingArea;
            if (x < vs.Left - W || x > vs.Right || y < vs.Top - H || y > vs.Bottom) { x = vs.Right - W - 20; y = FloorY(vs); }

            double r = rnd.NextDouble();
            if (r < 0.60 && look.Has(St.Walk))
            {
                Screen[] all = Screen.AllScreens;
                Rectangle wa = all[rnd.Next(all.Length)].WorkingArea;
                float px = wa.Left + (float)rnd.NextDouble() * Math.Max(1, wa.Width - W);
                float py = floorOnly || rnd.NextDouble() < 0.5
                    ? FloorY(wa)                                                              // walk along the taskbar
                    : wa.Top + (float)rnd.NextDouble() * Math.Max(1, wa.Height - H);         // or anywhere
                WalkTo(px, py, look.WalkMin + (float)rnd.NextDouble() * (look.WalkMax - look.WalkMin));
            }
            else if (r < 0.75 && look.Has(St.Sit)) { Enter(St.Sit); stateUntil = now + 3 + rnd.NextDouble() * 4; }
            else if (r < 0.83 && look.Has(St.Sleep)) { Enter(St.Sleep); stateUntil = now + 40 + rnd.NextDouble() * 60; }
            else if (r < 0.90 && cur == null && queue.Count == 0)
            {
                Msg m = new Msg(); m.Text = chatter[rnd.Next(chatter.Length)]; m.Mood = "none";
                queue.Enqueue(m); Pump();
            }
        }

        // Let go above the floor: fall (the fall animation repeats while in the air) until the floor is reached.
        void StartDrop()
        {
            Rectangle wa = Screen.FromPoint(new Point((int)(x + W / 2), (int)(y + H / 2))).WorkingArea;
            if (y < FloorY(wa) - 2)
            {
                dropping = true; vy = 0;
                if (look.Has(St.Fall)) Enter(St.Fall); else Enter(St.Idle);
            }
        }

        // Reached the floor: use the landing animation if the character has one.
        void Landed()
        {
            dropping = false;
            if (state == St.Fall || state == St.Idle) Enter(look.Has(St.Land) ? St.Land : St.Idle);
            nextThink = Math.Max(nextThink, sw.Elapsed.TotalSeconds + 1.5);
        }

        // A once-only animation (fall, land) finished.
        void AnimDone()
        {
            if (state == St.Fall && look.Has(St.Land)) Enter(St.Land);
            else { Enter(St.Idle); nextThink = Math.Max(nextThink, sw.Elapsed.TotalSeconds + 1.5); }
        }

        void Tick()
        {
            double now = sw.Elapsed.TotalSeconds;
            double dt = Math.Min(0.25, now - last); last = now;
            if (!ready) { if (now > 3) ready = true; else return; }

            if (dropping && !dragging)
            {
                Rectangle wd = Screen.FromPoint(new Point((int)(x + W / 2), (int)(y + H / 2))).WorkingArea;
                float floor = FloorY(wd);
                vy += 700 * dpi * (float)dt;                     // gravity: starts slow, so the fall is visible
                y = Math.Min(floor, y + vy * (float)dt);
                if (y >= floor) Landed();
            }

            if (state == St.Walk && !dragging && !dropping)
            {
                float dx = tx - x, dy = ty - y;
                float dist = (float)Math.Sqrt(dx * dx + dy * dy);
                float step = speed * (float)dt;
                if (dist <= step) { x = tx; y = ty; Enter(St.Idle); if (cur != null && !bubbleShown) ShowBubble(); nextThink = Math.Max(nextThink, now + 1.5); }
                else
                {
                    x += dx / dist * step; y += dy / dist * step;
                    bool fl = dx < 0;
                    if (Math.Abs(dx) > 1 && fl != faceLeft) faceLeft = fl;
                }
            }

            frameAcc += dt;
            if (frameAcc >= look.Seconds(state))
            {
                frameAcc = 0;
                int count = look.Count(state);
                if (frame + 1 >= count)
                {
                    if (look.Loops(state)) frame = 0;
                    else if (state == St.Fall && dropping) frame = count - 1;    // still falling: hold the last fall frame until the floor
                    else if (state == St.Fall || state == St.Land) AnimDone();
                    else frame = count - 1;
                }
                else frame++;
            }

            if (cur != null && bubbleShown && now >= bubbleUntil) Dismiss();
            if (pumpAt > 0 && now >= pumpAt) { pumpAt = -1; Pump(); }
            if ((state == St.Sit || state == St.Sleep) && now >= stateUntil) Enter(St.Idle);
            if (state == St.Idle && cur == null && !dragging && !dropping && now >= nextThink) Think(now);

            Draw();

            // Tick fast only while something is moving or animating.
            bool still = state == St.Idle || state == St.Sit || state == St.Sleep;
            int want = state == St.Walk || state == St.Drag || dropping ? 50
                     : state == St.Sleep ? 700
                     : still && look.Count(state) <= 2 ? 300
                     : 80;
            if (timer.Interval != want) timer.Interval = want;
        }

        void Draw()
        {
            if (!ready) return;
            pet.Present(look.Get(state, frame % look.Count(state), faceLeft), (int)x, (int)y);
            if (bubbleShown) PositionBubble();
        }

        // ---- mouse ----
        void OnDown(object o, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Right) { Send("menu"); return; }
            if (e.Button != MouseButtons.Left) return;
            down = true; dragging = false;
            Point c = Cursor.Position;
            downX = c.X; downY = c.Y; offX = c.X - (int)x; offY = c.Y - (int)y;
        }

        void OnMove(object o, MouseEventArgs e)
        {
            if (!down) return;
            Point c = Cursor.Position;
            if (!dragging && Math.Abs(c.X - downX) + Math.Abs(c.Y - downY) < 6) return;
            dragging = true; dropping = false;
            Enter(St.Drag);
            x = c.X - offX; y = c.Y - offY;
            Draw();
            if (timer.Interval != 50) timer.Interval = 50;
        }

        void OnUp(object o, MouseEventArgs e)
        {
            if (!down) return;
            down = false;
            double now = sw.Elapsed.TotalSeconds;
            if (dragging)
            {
                dragging = false;
                nextThink = now + 3;
                StartDrop();                                      // let go mid-air: fall to the floor, then land
                if (!dropping) Enter(look.Has(St.Land) ? St.Land : St.Idle);   // already on the floor: just settle
                Draw();
            }
            else
            {
                if (cur != null) Dismiss();
                queue.Clear();
                Msg m = new Msg(); m.Text = petLines[rnd.Next(petLines.Length)]; m.Mood = "happy";
                queue.Enqueue(m); Pump();
            }
        }

        protected override void ExitThreadCore()
        {
            timer.Stop();
            pet.Close(); bubbleWin.Close();
            look.Free();
            if (bFrame != null) bFrame.Free();
            base.ExitThreadCore();
        }

        public void RunOn(Action a) { pet.BeginInvoke(a); }
    }

    static class Program
    {
        [STAThread]
        static void Main()
        {
            bool created;
            using (Mutex mutex = new Mutex(true, "UNAGI.DesktopCompanion", out created))
            {
                if (!created) return; // one companion per user session

                Native.SetProcessDPIAware();
                Application.EnableVisualStyles();

                StreamWriter outp = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
                outp.AutoFlush = true;
                PetApp app = new PetApp(outp);

                Thread reader = new Thread(delegate ()
                {
                    try
                    {
                        StreamReader inp = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
                        string line;
                        while ((line = inp.ReadLine()) != null)
                        {
                            string l = line;
                            app.RunOn(delegate { app.Handle(l); });
                        }
                    }
                    catch (Exception) { }
                    try { app.RunOn(delegate { app.Handle("quit"); }); } catch (Exception) { }
                });
                reader.IsBackground = true;
                reader.Start();

                Application.Run(app);
            }
        }
    }
}
