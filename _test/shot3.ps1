param([string]$Match = "LensBlock", [string]$Out = "ddg.png", [int]$W = 1280, [int]$H = 860)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public class W2 {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int t,bool r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int cx,int cy,uint f);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  public struct RECT{public int L,T,R,B;}
  public static IntPtr Hit = IntPtr.Zero; public static string Needle="";
  public static bool Cb(IntPtr h, IntPtr l){
    if(!IsWindowVisible(h)) return true;
    int n = GetWindowTextLength(h); if(n==0) return true;
    StringBuilder sb=new StringBuilder(n+2); GetWindowText(h,sb,n+2);
    if(Hit==IntPtr.Zero && sb.ToString().IndexOf(Needle,StringComparison.OrdinalIgnoreCase)>=0) Hit=h;
    return true;
  }
  public static IntPtr Find(string needle){ Needle=needle; Hit=IntPtr.Zero; EnumWindows(new EnumProc(Cb), IntPtr.Zero); return Hit; }
  public static void ForceFront(IntPtr h){
    uint fpid; uint fth = GetWindowThreadProcessId(GetForegroundWindow(), out fpid);
    uint cur = GetCurrentThreadId();
    AttachThreadInput(cur, fth, true);
    ShowWindow(h,9); BringWindowToTop(h); SetForegroundWindow(h);
    SetWindowPos(h, new IntPtr(-1), 0,0,0,0, 0x0002|0x0001);   // TOPMOST, nomove/nosize
    AttachThreadInput(cur, fth, false);
  }
  public static void UnTop(IntPtr h){ SetWindowPos(h, new IntPtr(-2), 0,0,0,0, 0x0002|0x0001); }
}
"@
$h = [W2]::Find($Match)
if ($h -eq [IntPtr]::Zero) { Write-Output "NO WINDOW '$Match'"; exit 1 }
[W2]::ForceFront($h)
[W2]::MoveWindow($h, 30, 30, $W, $H, $true) | Out-Null
[W2]::ForceFront($h)
Start-Sleep -Milliseconds 2500
$r = New-Object W2+RECT
[W2]::GetWindowRect($h, [ref]$r) | Out-Null
$bw = $r.R - $r.L; $bh = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $bw, $bh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
$bmp.Save((Join-Path (Get-Location) $Out), [System.Drawing.Imaging.ImageFormat]::Png)
[W2]::UnTop($h)
Write-Output "SAVED $Out ($bw x $bh) rect=$($r.L),$($r.T),$($r.R),$($r.B)"
