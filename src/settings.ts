import { App, PluginSettingTab, Setting, Notice, Platform } from "obsidian";
import ModalOpenerPlugin from "./main";
import { t } from "./lang/helpers"

export interface ModalOpenerPluginSettings {
	// openMethod: "drag" | "middle" | "altclick" | "both";
	openMethod: "drag" | "altclick" | "both";
	fileOpenMode: 'current' | 'source' | 'preview';
	modalWidth: string;
	modalHeight: string;
	dragThreshold: number;
	enableAnimation: boolean;
	onlyCloseButton: boolean;
	customCommands: CustomCommand[];
	showFileViewHeader: boolean;
	showLinkViewHeader: boolean;
	showMetadata: boolean;
	hideTabHeader: boolean;
	preventsDuplicateTabs: boolean;
	delayInMs: number;
	enableRefreshOnClose: boolean;
	showFloatingButton: boolean;
	viewOfDisplayButton: string;
}

interface CustomCommand {
	id: string;
	name: string;
	command: string;
}

export const DEFAULT_SETTINGS: ModalOpenerPluginSettings = {
	openMethod: "both",
	fileOpenMode: 'current',
	modalWidth: "86vw",
	modalHeight: "86vh",
	dragThreshold: 200,
	enableAnimation: true,
	onlyCloseButton: false,
	customCommands: [],
	showFileViewHeader: false,
	showLinkViewHeader: false,
	showMetadata: false,
	hideTabHeader: true,
	preventsDuplicateTabs: false,
	delayInMs: 100,
	enableRefreshOnClose: true,
	showFloatingButton: true,
	viewOfDisplayButton: 'both',
};

export default class ModalOpenerSettingTab extends PluginSettingTab {
	plugin: ModalOpenerPlugin;
	openMethod: string;
	fileOpenMode: string;
	modalWidth: string;
	modalHeight: string;
	dragThreshold: number;
	enableAnimation: boolean;
	onlyCloseButton: boolean;
	customCommands: CustomCommand[];
	showFileViewHeader: boolean;
	showLinkViewHeader: boolean;
	showMetadata: boolean;
	hideTabHeader: boolean;
	preventsDuplicateTabs: boolean;
	delayInMs: number;
	enableRefreshOnClose: boolean;
	showFloatingButton: boolean;
	viewOfDisplayButton: string;

	constructor(app: App, plugin: ModalOpenerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		// Initialize settings with default values or plugin settings
		this.openMethod = this.plugin.settings.openMethod;
		this.fileOpenMode = this.plugin.settings.fileOpenMode
		this.modalWidth = this.plugin.settings.modalWidth;
		this.modalHeight = this.plugin.settings.modalHeight;
		this.dragThreshold = this.plugin.settings.dragThreshold;
		this.enableAnimation = this.plugin.settings.enableAnimation;
		this.onlyCloseButton = this.plugin.settings.onlyCloseButton;
		this.customCommands = this.plugin.settings.customCommands;
		this.showFileViewHeader = this.plugin.settings.showFileViewHeader;
		this.showLinkViewHeader = this.plugin.settings.showLinkViewHeader;
		this.showFloatingButton = this.plugin.settings.showFloatingButton;
		this.viewOfDisplayButton = this.plugin.settings.viewOfDisplayButton;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName(t("Open with"))
			.addDropdown((dd) => dd
					.addOption("both", t("Both"))
					// .addOption("middle", t("Middle mouse button"))
					.addOption("drag", t("Drag & Drop"))
					.addOption("altclick", t("Alt & Left click"))
					.setValue(this.plugin.settings.openMethod)
					// .onChange(async (value: "drag" | "middle" | "altclick" | "both") => {
					.onChange(async (value: "drag" | "altclick" | "both") => {
						this.plugin.settings.openMethod = value;
						await this.plugin.saveSettings();
						await this.reloadPlugin();
						this.display();
					}));

		if (this.plugin.settings.openMethod === "drag" || this.plugin.settings.openMethod === "both") {
			new Setting(containerEl)
				.setName(t("Drag and drop time threshold"))
				.setDesc(t("Set the minimum drag and drop time (in milliseconds) to trigger the link to open."))
				.addText((text) => text
					.setValue(String(this.plugin.settings.dragThreshold))
					.onChange(async (value) => {
						const numValue = Number(value);
						if (!isNaN(numValue) && numValue >= 0) {
							this.plugin.settings.dragThreshold = numValue;
							await this.plugin.saveSettings();
						}
					}));
		}

		new Setting(containerEl)
			.setName(t('Default editing mode'))
			.setDesc(t('Select the default mode for opening files in the modal window'))
			.addDropdown(dropdown => dropdown
				.addOption('current', t('Current file'))
				.addOption('preview', t('Reading'))
				.addOption('source', t('Editing'))
				.setValue(this.plugin.settings.fileOpenMode)
				.onChange(async (value) => {
					this.plugin.settings.fileOpenMode = value as 'default' | 'preview' | 'source';
					await this.plugin.saveSettings();
				}));
		if (!Platform.isMobile) {
			new Setting(containerEl)
				.setName(t("Add hover button"))
				.setDesc(t("Add hover button for accessibility functions in the modal window"))
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showFloatingButton)
					.onChange(async (value) => {
						this.plugin.settings.showFloatingButton = value;
						await this.plugin.saveSettings();
						await this.reloadPlugin();
					}));
		
			if (this.plugin.settings.showFloatingButton) {
				new Setting(containerEl)
					.setName(t("Add hover button to"))
					.addDropdown(dropdown => dropdown
						.addOption('both', t('Both'))
						.addOption('file', t('File view'))
						.addOption('link', t('Link view'))
						.setValue(this.plugin.settings.viewOfDisplayButton)
						.onChange(async (value) => {
							this.plugin.settings.viewOfDisplayButton = value as 'both' | 'file' | 'link';
							await this.plugin.saveSettings();
						}));
			}
		}

		new Setting(containerEl).setName(t('Behavior')).setHeading();

		new Setting(containerEl)
			.setName(t('Disable external click close'))
			.setDesc(t('Use only the "Close" button and "Esc" to close.'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.onlyCloseButton)
				.onChange(async (value) => {
					this.plugin.settings.onlyCloseButton = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
            .setName(t('Refresh view on close'))
            .setDesc(t('Refresh views when closing modal window, currently only refreshing after editing Canvas and Markmind file'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableRefreshOnClose)
                .onChange(async (value) => {
                    this.plugin.settings.enableRefreshOnClose = value;
                    await this.plugin.saveSettings();
                }));

		new Setting(containerEl)
			.setName(t('Prevents duplicate tabs'))
			.setDesc(t('In a new leaf opened the note to prevent duplicate (compatible with Modal-Opener, function from Mononote plugin)'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.preventsDuplicateTabs)
				.onChange(async (value) => {
					this.plugin.settings.preventsDuplicateTabs = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('Delay time'))
			.setDesc(t('Delay in milliseconds before performing operations'))
			.addSlider(slider => slider
				.setLimits(100, 500, 100)
				.setValue(this.plugin.settings.delayInMs)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.delayInMs = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName(t('Styles')).setHeading();

		new Setting(containerEl)
			.setName(t("Modal width"))
			.setDesc(t("Enter any valid CSS unit"))
			.addText((text) => text
				.setValue(this.modalWidth)
				.onChange(async (value) => {
					this.plugin.settings.modalWidth = value;
					this.modalWidth = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("Modal height"))
			.setDesc(t("Enter any valid CSS unit"))
			.addText((text) => text
				.setValue(this.modalHeight)
				.onChange(async (value) => {
					this.plugin.settings.modalHeight = value;
					this.modalHeight = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('Hide tab header'))
			.setDesc(t('Hides the tab header associated with the modal window'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideTabHeader)
				.onChange(async (value) => {
					this.plugin.settings.hideTabHeader = value;
					await this.plugin.saveSettings();
					this.plugin.applyStyles();
				}));

		new Setting(containerEl)
			.setName(t('Enable animation and blur'))
			.setDesc(t('Toggle to enable or disable animation and blur effects'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAnimation)
				.onChange(async (value) => {
					this.plugin.settings.enableAnimation = value;
					await this.plugin.saveSettings();
					this.plugin.applyStyles();
				}));

		new Setting(containerEl)
			.setName(t('Show metadata'))
			.setDesc(t('Show file metadata in the modal window'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showMetadata)
				.onChange(async (value) => {
					this.plugin.settings.showMetadata = value;
					await this.plugin.saveSettings();
					this.plugin.applyStyles();
			}));

		new Setting(containerEl)
			.setName(t('Show view header of the file'))
			.setDesc(t('Show the view header of the file in the modal window'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showFileViewHeader)
				.onChange(async (value) => {
					this.plugin.settings.showFileViewHeader = value;
					await this.plugin.saveSettings();
					this.plugin.applyStyles();
				}));

		new Setting(containerEl)
			.setName(t('Show view header of the link'))
			.setDesc(t('Show the Surfing plugin\'s navigation bar and bookmarks bar'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showLinkViewHeader)
				.onChange(async (value) => {
					this.plugin.settings.showLinkViewHeader = value;
					await this.plugin.saveSettings();
					this.plugin.applyStyles();
				}));

		new Setting(containerEl).setName(t('Custom commands')).setHeading();

		new Setting(containerEl)
			.setName(t("Add custom command"))
			.setDesc(t("Add a new custom command"))
			.addButton((button) => button
				.setButtonText(t("Add"))
				.onClick(() => {
					this.addCustomCommand();
				}));

		const customCommandsContainer = containerEl.createDiv("custom-commands-container");
		this.plugin.settings.customCommands.forEach((command, index) => {
			this.createCustomCommandSetting(customCommandsContainer, command, index);
		});
	}

	addCustomCommand() {
		const newCommand: CustomCommand = {
			id: "",
			name: "",
			command: ""
		};
		this.plugin.settings.customCommands.push(newCommand);
		this.display();
	}

	createCustomCommandSetting(containerEl: HTMLElement, command: CustomCommand, index: number) {
		let tempCommand = { ...command };

		const setting = new Setting(containerEl)
			.addText((text) => text
				.setPlaceholder(t("Command name"))
				.setValue(tempCommand.name)
				.onChange((value) => {
					tempCommand.id = `modal-opener:${value}`;
					tempCommand.name = value;
				}))
			.addText((text) => text
				.setPlaceholder(t("Description"))
				.setValue(tempCommand.command)
				.onChange((value) => {
					tempCommand.command = value;
				}))
			.addButton((button) => button
				.setButtonText(t("Confirm"))
				.onClick(async () => {
					if (tempCommand.name && tempCommand.command) {
						// 检查命令名是否已存在
						const isDuplicate = this.plugin.settings.customCommands.some((cmd, i) =>
							cmd.name === tempCommand.name && i !== index
						);

						if (isDuplicate) {
							new Notice(t("The command name already exists, please use a different name"));
							return;
						}

						if (index >= 0) {
							this.plugin.settings.customCommands[index] = tempCommand;
						} else {
							this.plugin.settings.customCommands.push(tempCommand);
						}
						await this.plugin.saveSettings();
						new Notice(t("Command added successfully"));
						this.display(); // 刷新设置页面
					} else {
						new Notice(t("Please enter both command name and description"));
					}
				}))
			.addExtraButton((button) => button
				.setIcon("trash")
				.setTooltip(t("Delete"))
				.onClick(() => {
					this.deleteCustomCommand(index);
				}));

		const textInputs = setting.controlEl.querySelectorAll('.setting-item-control input');
		textInputs.forEach((input: HTMLElement) => {
			input.addClass('custom-command-input');
		});

		return setting;
	}

	deleteCustomCommand(index: number): void {
		this.plugin.settings.customCommands.splice(index, 1);
		this.plugin.saveSettings();
		this.reloadPlugin();
		this.display();
		new Notice(t("Command deleted successfully. Please restart Obsidian for changes to take full effect."));
	}

	async reloadPlugin() {
		await this.plugin.saveSettings();
		const app = this.plugin.app as any;
		await app.plugins.disablePlugin("modal-opener");
		await app.plugins.enablePlugin("modal-opener");
		app.setting.openTabById("modal-opener").display();
	}
}