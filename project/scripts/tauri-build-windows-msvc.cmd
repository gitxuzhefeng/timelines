@echo off
setlocal EnableExtensions

REM ARM64 Windows: use x64 host MSVC to link ARM64 (Rust aarch64-pc-windows-msvc).
REM See: vcvarsall.bat usage "amd64_arm64" -> Developer Prompt shows "x64_arm64".

set "VSDIR=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
call "%VSDIR%\VC\Auxiliary\Build\vcvarsall.bat" amd64_arm64 || exit /b 1

REM Prefer stable system Node install; keep cargo/rustup on PATH.
set "PATH=C:\Program Files\nodejs;%USERPROFILE%\.cargo\bin;%PATH%"

REM ring: build script may invoke clang (LLVM). Install LLVM and keep it on PATH.
if exist "C:\Program Files\LLVM\bin\clang.exe" set "PATH=C:\Program Files\LLVM\bin;%PATH%"

cd /d "%~dp0.."

REM Optional: faster crates.io index in CN networks (remove these lines if you prefer default).
if not defined CARGO_REGISTRIES_CRATES_IO_PROTOCOL set "CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse"
if not defined CARGO_REGISTRIES_CRATES_IO_INDEX set "CARGO_REGISTRIES_CRATES_IO_INDEX=sparse+https://rsproxy.cn/crates.io-index"

where link >nul 2>nul || (echo ERROR: link.exe not found after vcvarsall amd64_arm64. & exit /b 1)
where node >nul 2>nul || (echo ERROR: node.exe not found. Install Node.js or adjust PATH in this script. & exit /b 1)

call npm run tauri build
exit /b %ERRORLEVEL%
