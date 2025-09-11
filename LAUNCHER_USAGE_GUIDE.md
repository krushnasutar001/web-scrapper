# 🚀 Scraze Launcher Usage Guide

## Available Launchers

You now have **4 different ways** to launch Scraze, each with different features:

### 1. 🎯 **Quick_Launch_Scraze.bat** (RECOMMENDED)
**Best for: Daily use, beginners**

- **Double-click to start** - No technical knowledge needed
- **Automatic process cleanup** - Kills existing instances
- **Smart launcher selection** - Uses PowerShell if available, falls back to batch
- **Built-in restart option** - Easy to restart without closing
- **Debug tool integration** - Quick access to troubleshooting

```bash
# Just double-click the file or run:
Quick_Launch_Scraze.bat
```

### 2. 💪 **LAUNCH_SCRAZE.ps1** (MOST POWERFUL)
**Best for: Advanced users, troubleshooting**

- **Advanced process management** - Intelligent process detection
- **Network reset capabilities** - Clears DNS cache and network locks
- **Detailed logging** - Shows exactly what's happening
- **Force mode** - Can kill stubborn processes
- **Quiet mode** - For automated scripts

```powershell
# Basic usage:
.\LAUNCH_SCRAZE.ps1

# Force kill all Node.js processes:
.\LAUNCH_SCRAZE.ps1 -Force

# Quiet mode (no prompts):
.\LAUNCH_SCRAZE.ps1 -Quiet

# Both options:
.\LAUNCH_SCRAZE.ps1 -Force -Quiet
```

### 3. 🔧 **LAUNCH_SCRAZE.bat** (SIMPLE)
**Best for: Basic cleanup, compatibility**

- **Simple process cleanup** - Basic port and process management
- **Wide compatibility** - Works on all Windows versions
- **Automatic restart** - Press any key to restart
- **Lightweight** - Minimal resource usage

```bash
# Run directly:
LAUNCH_SCRAZE.bat
```

### 4. 📦 **START_SCRAZE.bat** (ORIGINAL)
**Best for: When no cleanup is needed**

- **Direct start** - No process cleanup
- **Fastest startup** - No delays
- **Original launcher** - The base system launcher

```bash
# Original launcher:
START_SCRAZE.bat
```

## 🎯 Which Launcher Should You Use?

### For Daily Use:
```
✅ Quick_Launch_Scraze.bat
```
**Why?** Easy to use, handles everything automatically, includes restart and debug options.

### For Troubleshooting:
```
✅ LAUNCH_SCRAZE.ps1 -Force
```
**Why?** Most powerful cleanup, detailed logging, can force-kill stubborn processes.

### For Automation/Scripts:
```
✅ LAUNCH_SCRAZE.ps1 -Quiet
```
**Why?** No user prompts, suitable for automated deployment.

### For Quick Restart:
```
✅ LAUNCH_SCRAZE.bat
```
**Why?** Simple, fast, automatic restart option.

## 🔧 Common Usage Scenarios

### Scenario 1: First Time Setup
```bash
# Use the quick launcher:
Double-click: Quick_Launch_Scraze.bat
```

### Scenario 2: System is Stuck/Not Responding
```powershell
# Force cleanup and restart:
.\LAUNCH_SCRAZE.ps1 -Force
```

### Scenario 3: Ports are Occupied
```bash
# Any of the smart launchers will handle this:
Quick_Launch_Scraze.bat
# OR
LAUNCH_SCRAZE.bat
```

### Scenario 4: Need to Debug Issues
```bash
# Use quick launcher and select Debug option:
Quick_Launch_Scraze.bat
# Then press 'D' when prompted
```

### Scenario 5: Automated Deployment
```powershell
# Silent launch for scripts:
.\LAUNCH_SCRAZE.ps1 -Quiet -Force
```

## 🛠️ Troubleshooting

### Problem: "Access Denied" or "Execution Policy"
**Solution:** Run PowerShell as Administrator or use batch launchers
```powershell
# Fix execution policy:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Problem: Ports Still Occupied After Cleanup
**Solution:** Use force mode
```powershell
.\LAUNCH_SCRAZE.ps1 -Force
```

### Problem: Launcher Not Found
**Solution:** Make sure you're in the correct directory
```bash
cd "C:\Users\krush\OneDrive\Desktop\Final\linkedin-automation-saas"
```

### Problem: System Won't Start
**Solution:** Check the debug tool
```bash
# Open debug tool:
start frontend-debug-auth.html
```

## 📋 Quick Reference

| Launcher | Cleanup | Restart | Debug | Best For |
|----------|---------|---------|-------|----------|
| Quick_Launch_Scraze.bat | ✅ | ✅ | ✅ | Daily use |
| LAUNCH_SCRAZE.ps1 | ✅✅ | ✅ | ❌ | Advanced users |
| LAUNCH_SCRAZE.bat | ✅ | ✅ | ❌ | Simple cleanup |
| START_SCRAZE.bat | ❌ | ❌ | ❌ | Direct start |

## 🎉 Success Indicators

When Scraze starts successfully, you should see:

```
✅ Backend started (PID: XXXX)
✅ Backend: http://localhost:3001
✅ Frontend started (PID: XXXX) 
✅ Frontend: http://localhost:3000
✅ Scraze is now running!
```

## 🔗 Quick Links After Launch

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/health
- **Login:** test@example.com / password123

---

**💡 Pro Tip:** Bookmark `Quick_Launch_Scraze.bat` on your desktop for instant access to Scraze!