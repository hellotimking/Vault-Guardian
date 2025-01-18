import { App, Plugin, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import { join, isAbsolute } from 'path';
import AdmZip from 'adm-zip';

interface BackupPluginSettings {
    backupPath: string;
    secondaryBackupPath: string;
    autoBackupInterval: number;
    lastBackupTime: number;
    compressionLevel: number;
    maxBackupCount: number;  // New setting for backup retention
    secondaryMaxBackupCount: number; // Retention for secondary
}

const DEFAULT_SETTINGS: BackupPluginSettings = {
    backupPath: '',
    secondaryBackupPath: '',
    autoBackupInterval: 24,
    lastBackupTime: 0,
    compressionLevel: 9,
    maxBackupCount: 5, // Default to keeping 10 backups
    secondaryMaxBackupCount: 10, // Default to 10 backups for secondary
}

class BackupScheduler {
    private plugin: VaultBackupPlugin;
    private nextBackupTime: number = 0;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(plugin: VaultBackupPlugin) {
        this.plugin = plugin;
    }

    scheduleNextBackup(): void {
        const lastBackupTime = this.plugin.settings.lastBackupTime || Date.now();
        const intervalMs = this.plugin.settings.autoBackupInterval * 60 * 60 * 1000; // hours to ms

        this.nextBackupTime = lastBackupTime + intervalMs;

        // If next backup time is in the past, schedule for next interval from now
        if (this.nextBackupTime <= Date.now()) {
            this.nextBackupTime = Date.now() + intervalMs;
        }

        console.log(`Next backup scheduled for: ${new Date(this.nextBackupTime).toLocaleString()}`);

        // Trigger status bar update
        this.plugin.updateStatusBarText();
    }

    startScheduler(): void {
        // Initial schedule
        this.scheduleNextBackup();

        // Check every 30 seconds for pending backups
        this.checkInterval = setInterval(() => {
            this.checkAndRunBackup();
        }, 30 * 1000);
    }

    stopScheduler(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    private async checkAndRunBackup(): Promise<void> {
        if (Date.now() >= this.nextBackupTime && !this.plugin.isBackingUp()) {
            await this.plugin.createBackup();
            this.scheduleNextBackup();
        }
    }

    getNextBackupTime(): number {
        return this.nextBackupTime;
    }

    getTimeUntilNextBackup(): { hours: number; minutes: number; seconds: number } {
        const timeLeft = this.nextBackupTime - Date.now();
    
        if (timeLeft < 0) {
            return { hours: 0, minutes: 0, seconds: 0 };
        }
    
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
        return { hours, minutes, seconds };
    }

    forceBackupNow(): void {
        this.plugin.createBackup();
        this.scheduleNextBackup();
    }

    rescheduleFromNow(): void {
        const intervalMs = this.plugin.settings.autoBackupInterval * 60 * 60 * 1000;
        this.nextBackupTime = Date.now() + intervalMs;
        console.log(`Backup rescheduled for: ${new Date(this.nextBackupTime).toLocaleString()}`);

        // Trigger status bar update
        this.plugin.updateStatusBarText();
    }
}


export default class VaultBackupPlugin extends Plugin {
    settings: BackupPluginSettings;
    private isBackupInProgress: boolean = false;
    private backupScheduler: BackupScheduler;
    private statusBarItem: HTMLElement; // Status bar for displaying backup status

    async onload() {
        await this.loadSettings();

        // Create status bar item
        this.statusBarItem = this.addStatusBarItem();

        // Initialize backup scheduler
        this.backupScheduler = new BackupScheduler(this);

        // Start scheduler
        this.backupScheduler.startScheduler();

        // Update status bar immediately and then every second
        this.updateStatusBarText();
        this.registerInterval(
            window.setInterval(() => {
                this.updateStatusBarText();
            }, 1000) // Every second
        );

        // Add settings tab
        this.addSettingTab(new BackupSettingTab(this.app, this));
    }

    onunload() {
        this.backupScheduler.stopScheduler();
        this.statusBarItem.remove(); // Clean up status bar
    }

    async updateStatusBarText() {
        const { hours, minutes, seconds } = this.backupScheduler.getTimeUntilNextBackup();

        if (this.isBackupInProgress) {
            this.statusBarItem.setText('Backing Up Vault');
        } else if (hours === 0 && minutes === 0 && seconds === 0) {
            this.statusBarItem.setText('Starting Backup');
        } else {
            this.statusBarItem.setText(`Backup: ${hours}h ${minutes}m ${seconds}s`);
        }
    }

    isBackingUp(): boolean {
        return this.isBackupInProgress;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }


    private async ensureBackupDir(path: string): Promise<void> {
        const fs = require('fs/promises');
        try {
            await fs.mkdir(path, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    private getBackupPath(filename: string): string {
        if (!this.settings.backupPath) {
            // If no backup path specified, use vault root
            return join(this.app.vault.adapter.getBasePath(), filename);
        } else if (isAbsolute(this.settings.backupPath)) {
            // If absolute path, use it directly
            return join(this.settings.backupPath, filename);
        } else {
            // If relative path, make it relative to vault
            return join(this.app.vault.adapter.getBasePath(), this.settings.backupPath, filename);
        }
    }

    private async cleanOldBackups(currentBackupPath: string): Promise<void> {
        if (this.settings.maxBackupCount <= 0) return; // Keep all backups
    
        const fs = require('fs').promises;
        const path = require('path');
    
        // Helper function to clean backups in a specified directory
        const cleanDirectory = async (backupDir: string, retentionCount: number) => {
            try {
                const files = await fs.readdir(backupDir);
    
                // Filter for zip files and sort by date (newest first)
                const backupFiles = await Promise.all(
                    files
                        .filter(f => f.endsWith('.zip'))
                        .map(async (filename) => {
                            const filePath = path.join(backupDir, filename);
                            const stats = await fs.stat(filePath);
                            return {
                                name: filename,
                                path: filePath,
                                time: stats.mtime.getTime(),
                            };
                        })
                );
    
                const sortedBackupFiles = backupFiles.sort((a, b) => b.time - a.time);
    
                // Keep the current backup plus retentionCount - 1 previous backups
                const filesToDelete = sortedBackupFiles.slice(retentionCount);
    
                for (const file of filesToDelete) {
                    try {
                        await fs.unlink(file.path);
                        console.log(`Deleted old backup: ${file.name}`);
                    } catch (error) {
                        console.error(`Failed to delete backup ${file.name}:`, error);
                    }
                }
            } catch (error) {
                console.error(`Error cleaning old backups in ${backupDir}:`, error);
            }
        };
    
        // Clean primary backup location with its own retention count
        const primaryBackupDir = this.settings.backupPath || this.app.vault.adapter.backupPath();
        await cleanDirectory(primaryBackupDir, this.settings.maxBackupCount);
    
        // Clean secondary backup location with its own retention count (if specified)
        if (this.settings.secondaryBackupPath && this.settings.secondaryBackupPath.trim() !== '') {
            const secondaryBackupDir = this.settings.secondaryBackupPath;
            await cleanDirectory(secondaryBackupDir, this.settings.secondaryMaxBackupCount);
        }
    }
    

    async createBackup() {
        let noticeEF: Notice | null = null;
        let progressNotice: Notice | null = null;

        // Check if a backup path is set
        if (!this.settings.backupPath || this.settings.backupPath.trim() === '') {
            new Notice('❌ No primary backup path set.', 5000);
            const noticeEF = document.body.querySelector('.notice:last-child');
            noticeEF?.classList.add('backup-fail'); 
            return;
        }


        try {
            this.isBackupInProgress = true;
            const vault = this.app.vault;
            const AdmZip = require('adm-zip');
            const fs = require('fs').promises;
            const path = require('path');
    
            // Create new zip file
            const zip = new AdmZip();
            
            // Get all vault files and .obsidian contents
            const vaultFiles = vault.getFiles();
            const vaultPath = this.app.vault.adapter.getBasePath();
            const obsidianPath = path.join(vaultPath, '.obsidian');
    
            // Show initial progress
            progressNotice = new Notice('🚀 Starting Backup', 0);
            const noticeEF = document.body.querySelector('.notice:last-child');
            noticeEF?.classList.add('start-backup');
    
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Add vault files first
            let processedFiles = 0;
            const totalFiles = vaultFiles.length;
    
            for (const file of vaultFiles) {
                const content = await vault.read(file);
                zip.addFile(file.path, Buffer.from(content));
                
                processedFiles++;
                const percent = Math.round((processedFiles / totalFiles) * 100);
                progressNotice.setMessage(`➕ Adding files: ${percent}%`, 0);
                noticeEF?.classList.add('add-files');
            }
            
            async function addFolderToZip(zip: any, folderPath: string, zipBasePath: string = '') {
                const fs = require('fs/promises');
                const path = require('path');
            
                try {
                    const files = await fs.readdir(folderPath, { withFileTypes: true });
                    
                    for (const file of files) {
                        const fullPath = path.join(folderPath, file.name);
                        const zipPath = path.join(zipBasePath, file.name);
                        
                        try {
                            const stats = await fs.lstat(fullPath);
                            
                            if (stats.isSymbolicLink()) {
                                const linkTarget = await fs.readlink(fullPath);
                                zip.addFile(zipPath, Buffer.from(linkTarget));
                                continue;
                            }
                            
                            if (stats.isDirectory()) {
                                zip.addFile(zipPath + '/', Buffer.from([]));
                                await addFolderToZip(zip, fullPath, zipPath);
                            } else if (stats.isFile()) {
                                try {
                                    const content = await fs.readFile(fullPath);
                                    zip.addFile(zipPath, content);
                                } catch (fileError) {
                                    try {
                                        const content = await fs.readFile(fullPath, 'utf8');
                                        zip.addFile(zipPath, Buffer.from(content));
                                    } catch (retryError) {
                                        console.error(`Error reading file in .obsidian folder: ${zipPath}`);
                                    }
                                }
                            }
                        } catch (statError) {
                            console.warn(`Skipping problematic path in .obsidian folder`);
                        }
                    }
                } catch (error) {
                    console.error(`Error accessing folder in .obsidian`);
                    throw error;
                }
            }
    
            try {
                progressNotice.setMessage('🔍 Verifying Backup', 0);
                noticeEF?.classList.add('verify-files');
                await addFolderToZip(zip, obsidianPath, '.obsidian');  // Removed zipOptions parameter
            } catch (error) {
                console.warn('Error adding .obsidian folder:', error);
                progressNotice.setMessage('⚠️ Partial .obsidian folder added', 2000);
            }
    
            // Create timestamp for filename
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const vaultName = this.app.vault.getName();
            const zipName = `${timestamp}_${vaultName}.zip`;
    
            // Ensure backup directory exists
            if (this.settings.backupPath) {
                await this.ensureBackupDir(
                    isAbsolute(this.settings.backupPath) 
                        ? this.settings.backupPath 
                        : path.join(vaultPath, this.settings.backupPath)
                );
            }
    
            const backupPath = this.getBackupPath(zipName);

    
            // Write the zip file
            await new Promise<void>((resolve, reject) => {
                try {
                    zip.writeZip(backupPath);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
    
            // Handle secondary backup if specified
            if (this.settings.secondaryBackupPath && this.settings.secondaryBackupPath.trim() !== '') {
                try {
                    const secondaryBackupPath = path.join(this.settings.secondaryBackupPath, zipName);
                    await fs.copyFile(backupPath, secondaryBackupPath);
                } catch (error) {
                    console.error('Error creating secondary backup:', error);
                    new Notice(`Secondary backup folder does not exist`);
                    const noticeEl = document.body.querySelector('.notice:last-child');
                    noticeEl?.classList.add('backup-fail');
                }
            }

            // Update last backup time
            this.settings.lastBackupTime = Date.now();
            await this.saveSettings();
    
            // After successful backup and before final success message
            await this.cleanOldBackups(backupPath);

            progressNotice.setMessage('✅ Backup Created', 0);
            const noticeEl = document.body.querySelector('.notice:last-child');
            noticeEl?.classList.add('backup-success');
            await new Promise(resolve => setTimeout(resolve, 2000));
            progressNotice.hide();
    
        } catch (error) {
            if (progressNotice) {
                progressNotice.setMessage(`❌ Backup failed: ${error.message}`, 2000);
                const noticeEl = document.body.querySelector('.notice:last-child');
                noticeEl?.classList.add('backup-fail');
                await new Promise(resolve => setTimeout(resolve, 2000));
                progressNotice.hide();
            }
            console.error('Backup error:', error);
        } finally {
            this.isBackupInProgress = false;
        }
    }
}



class BackupSettingTab extends PluginSettingTab {
    plugin: VaultBackupPlugin;
    private countdownInterval: NodeJS.Timeout | null = null; // Interval for live countdown

    constructor(app: App, plugin: VaultBackupPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: 'Vault Guardian' });
        containerEl.createEl('p', { text: 'Your trusted backup solution for Obsidian.' });

        // Backup Locations Section
        containerEl.createEl('h3', { text: 'Backup Locations' });

        new Setting(containerEl)
            .setName('Primary Backup Location')
            .setDesc('Directory path for backups (absolute path or relative to vault)')
            .addText(text => {
                const textComponent = text
                    .setPlaceholder('Example: /path/to/backups or backups')
                    .setValue(this.plugin.settings.backupPath)
                    .onChange(async (value) => {
                        this.plugin.settings.backupPath = value;
                        await this.plugin.saveSettings();
                    });

                const parentEl = text.inputEl.parentElement!;
                parentEl.style.display = 'flex';
                parentEl.style.alignItems = 'center';

                const button = document.createElement('button');
                button.textContent = 'Browse';
                button.style.marginLeft = '10px';
                button.className = 'mod-cta';
                button.addEventListener('click', async () => {
                    try {
                        // @ts-ignore
                        const remote = require('electron').remote;
                        const dialog = remote.dialog;

                        const result = await dialog.showOpenDialog({
                            properties: ['openDirectory', 'createDirectory'],
                            title: 'Select Backup Location',
                            buttonLabel: 'Select Folder',
                            defaultPath: this.plugin.settings.backupPath || this.app.vault.adapter.getBasePath()
                        });

                        if (!result.canceled && result.filePaths.length > 0) {
                            const selectedPath = result.filePaths[0];
                            this.plugin.settings.backupPath = selectedPath;
                            await this.plugin.saveSettings();
                            textComponent.setValue(selectedPath);
                            new Notice('Backup location updated');
                        }
                    } catch (error) {
                        console.error('Folder selection error:', error);
                        new Notice('Could not open folder picker');
                    }
                });

                parentEl.appendChild(button);
            });

        new Setting(containerEl)
            .setName('Secondary Backup Location')
            .setDesc('Optional: Directory path for a secondary backup copy (absolute path)')
            .addText(text => {
                const textComponent = text
                    .setPlaceholder('Example: /path/to/secondary/backup')
                    .setValue(this.plugin.settings.secondaryBackupPath)
                    .onChange(async (value) => {
                        this.plugin.settings.secondaryBackupPath = value;
                        await this.plugin.saveSettings();
                    });

                const parentEl = text.inputEl.parentElement!;
                parentEl.style.display = 'flex';
                parentEl.style.alignItems = 'center';

                const button = document.createElement('button');
                button.textContent = 'Browse';
                button.style.marginLeft = '10px';
                button.className = 'mod-cta';
                button.addEventListener('click', async () => {
                    try {
                        // @ts-ignore
                        const remote = require('electron').remote;
                        const dialog = remote.dialog;

                        const result = await dialog.showOpenDialog({
                            properties: ['openDirectory', 'createDirectory'],
                            title: 'Select Secondary Backup Location',
                            buttonLabel: 'Select Folder',
                            defaultPath: this.plugin.settings.secondaryBackupPath || this.app.vault.adapter.getBasePath()
                        });

                        if (!result.canceled && result.filePaths.length > 0) {
                            const selectedPath = result.filePaths[0];
                            this.plugin.settings.secondaryBackupPath = selectedPath;
                            await this.plugin.saveSettings();
                            textComponent.setValue(selectedPath);
                            new Notice('Secondary backup location updated');
                        }
                    } catch (error) {
                        console.error('Folder selection error:', error);
                        new Notice('Could not open folder picker');
                    }
                });

                parentEl.appendChild(button);
            });

        // Automated Backup Section
        containerEl.createEl('h3', { text: 'Automated Backup Settings' });

        new Setting(containerEl)
            .setName('Maximum Primary Backups')
            .setDesc('Number of backups to keep in the primary location (0 = keep all)')
            .addText(text => text
                .setPlaceholder('10')
                .setValue(String(this.plugin.settings.maxBackupCount))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.maxBackupCount = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Maximum Secondary Backups')
            .setDesc('Number of backups to keep in the secondary location (0 = keep all)')
            .addText(text => text
                .setPlaceholder('10')
                .setValue(String(this.plugin.settings.secondaryMaxBackupCount))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.secondaryMaxBackupCount = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Auto-backup Interval')
            .setDesc('How often to automatically create backups')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('0.016666667', 'Every minute') // 1/60 hour
                    .addOption('0.5', 'Every 30 minutes')
                    .addOption('1', 'Every hour')
                    .addOption('2', 'Every 2 hours')
                    .addOption('3', 'Every 3 hours')
                    .addOption('4', 'Every 4 hours')
                    .addOption('6', 'Every 6 hours')
                    .addOption('8', 'Every 8 hours')
                    .addOption('12', 'Every 12 hours')
                    .addOption('24', 'Once a day')
                    .addOption('48', 'Every 2 days')
                    .addOption('72', 'Every 3 days')
                    .addOption('168', 'Once a week')
                    .addOption('336', 'Every 2 weeks')
                    .addOption('720', 'Once a month')
                    .setValue(String(this.plugin.settings.autoBackupInterval))
                    .onChange(async (value) => {
                        this.plugin.settings.autoBackupInterval = Number(value);
                        await this.plugin.saveSettings();
                        this.plugin.backupScheduler.scheduleNextBackup();
                        
                        // Show next backup time
                        const { hours, minutes, seconds } = this.plugin.backupScheduler.getTimeUntilNextBackup();
                        new Notice(`Next backup scheduled in ${hours}h ${minutes}m ${seconds}s`);
                    });
            });

        // Display next scheduled backup with live countdown
        const nextBackupSetting = new Setting(containerEl)
            .setName('Next Scheduled Backup')
            .setDesc('Calculating...')
            .addButton(button =>
                button.setButtonText('Backup Now').onClick(() => {
                    this.plugin.backupScheduler.forceBackupNow();
                }));

        const updateCountdown = () => {
            const { hours, minutes, seconds } = this.plugin.backupScheduler.getTimeUntilNextBackup();
            nextBackupSetting.setDesc(`${hours}h ${minutes}m ${seconds}s`);
        };

        updateCountdown(); // Initial update
        this.countdownInterval = window.setInterval(updateCountdown, 1000);

        // Last backup time
        if (this.plugin.settings.lastBackupTime) {
            const lastBackupDate = new Date(this.plugin.settings.lastBackupTime);
            new Setting(containerEl)
                .setName('Last Backup Time')
                .setDesc(lastBackupDate.toLocaleString());
        }
    }

    hide(): void {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }
}
