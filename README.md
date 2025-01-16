# Vault Guardian 🚀  
**Your ultimate Obsidian backup companion!**  

Vault Guardian ensures your valuable notes and ideas are safe with automated, customizable, and robust backup solutions tailored to your workflow. Say goodbye to data loss and hello to peace of mind.

![Vault Guardian Screenshot](https://github.com/hellotimking/Vault-Guardian/blob/main/screenshot.png)

---

## Features 🌟

- **Primary & Secondary Backups**: Specify separate backup locations for double-layer protection.  
- **Custom Backup Intervals**: Automate backups from every minute to once a month.  
- **Retention Settings**: Control the number of backups to keep in primary and secondary locations.  
- **Compression Efficiency**: Create lightweight, high-compression `.zip` backups with customizable compression levels.  
- **Live Countdown Timer**: Stay updated with a real-time countdown to your next scheduled backup.  
- **Manual Backup on Demand**: Need a quick backup? Just hit the button!  
- **Status Bar Integration**: Always know the status of your backup with dynamic, live updates in the Obsidian status bar.  
- **.Obsidian Folder Backup**: Includes your `.obsidian` folder (themes, plugins, and settings) to ensure a complete vault recovery.  
- **Error Handling**: Get notified of issues, like missing backup paths or permissions, with detailed error messages.  

---

## Why Choose Vault Guardian? 🛡️  

In Obsidian, your notes are more than just text files—they’re your ideas, research, and creativity. Vault Guardian keeps them secure, ensuring no idea gets lost to technical mishaps.  

---

## Getting Started 🚀  

### Installation  
1. Download the plugin from the Obsidian community plugin library.  
2. Enable it in your Obsidian settings.  
3. Configure your backup preferences in the **Vault Guardian Settings** tab.

---

### Configuration ⚙️  

1. **Multiple Backup Locations**:  
   - Set a **Primary Backup Location**
   - Optionally, add a **Secondary Backup Location** for redundancy.  

2. **Individual Backup Retention**:  
   - Define how many backups to keep in each backup location (e.g., 10 backups).  

3. **Automated Backups**:  
   - Select your preferred backup interval, ranging from **every minute** to **once a month**.  

4. **Manual Backup**:  
   - Start a backup immediately with the **Backup Now** button in the settings tab.  

5. **Next Scheduled Backup**:  
   - Monitor your next backup with a live countdown timer. (Also shown in status bar)

---


## How It Works 🛠️  

Simply put, Vault Guardian zips your entire vault into a timestamped zip file. Backups are saved to your chosen primary and secondary locations, with intelligent cleanup of old backups to save you space.

---

## Advanced Features 🔧  
  
- **Backup Validation**: Ensures all files, including your `.obsidian` folder, are correctly added to the backup archive.
- **Dual Retention Settings**: Independantly removes older backups based on your retention preferences for both your primary and secondary backup locations.

---

## Status Bar and Notifications 📊  

- **Backup in Progress**: Displays `Backup: Now 🚀`.  
- **Countdown Timer**: Shows time remaining until the next scheduled backup (e.g., `Backup: 2h 15m 30s`).  
- **Errors**: Alerts you if issues arise, such as a missing backup location, verification issues arise,.  

---

## Frequently Asked Questions  

### 1. Where are my backups stored?  
While configuring Vault Guardian you'll define your primary and secondary backup locations in the settings. Simply use the Browse buttons in the 

### 2. Can I keep unlimited backups?  
Yes! Set the retention count to `0` to keep all backups without cleanup.  

### 3. What happens if a backup fails?  
Vault Guardian provides detailed error messages to help troubleshoot issues.

---

## Support & Feedback 💬  

Encountered an issue? Have a feature request? Submit an issue on the GitHub Repository.
