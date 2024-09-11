import { App, PluginSettingTab, Setting } from "obsidian";
import ModalOpenPlugin from "./main";
import { t } from "./lang/helpers"

export interface ModalOpenPluginSettings {
	openMethod: "drag" | "middle" | "altclick" | "both";
	fileOpenMode: 'current' | 'source' | 'preview';
	modalWidth: string;
	modalHeight: string;
	dragThreshold: number;
	enableAnimation: boolean;
	onlyCloseButton: boolean;
	customCommands: CustomCommand[];
	showFileViewHeader: boolean;
	showLinkViewHeader: boolean;
}

interface CustomCommand {
	name: string;
	command: string;
}

export const DEFAULT_SETTINGS: ModalOpenPluginSettings = {
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
};

export default class ModalOpenSettingTab extends PluginSettingTab {
	plugin: ModalOpenPlugin;
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

	constructor(app: App, plugin: ModalOpenPlugin) {
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
	}

	async reloadPlugin() {
		await this.plugin.saveSettings();
		const app = this.plugin.app as any;
		await app.plugins.disablePlugin("obsidian-modal-plugin");
		await app.plugins.enablePlugin("obsidian-modal-plugin");
		app.setting.openTabById("obsidian-modal-plugin").display();
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName(t("Open with"))
			.addDropdown((dd) =>
				dd
					.addOption("both", t("Both"))
					.addOption("drag", t("Drag & Drop"))
					.addOption("middle", t("Middle Mouse Button"))
					.addOption("altclick", t("Alt & Left Click"))
					.setValue(this.plugin.settings.openMethod)
					.onChange(async (value: "drag" | "middle" | "altclick" | "both") => { // 更新类型
						this.plugin.settings.openMethod = value;
						await this.plugin.saveSettings();
						await this.reloadPlugin();
						this.display();
					}));

		new Setting(containerEl)
			.setName(t('Disable external click Close'))
			.setDesc(t('Use only the "Close" button and Esc to close.'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.onlyCloseButton)
				.onChange(async (value) => {
					this.plugin.settings.onlyCloseButton = value;
					await this.plugin.saveSettings();
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
			.addOption('current', t('Current File'))
			.addOption('source', t('Edit'))
			.addOption('preview', t('Preview'))
			.setValue(this.plugin.settings.fileOpenMode)
			.onChange(async (value) => {
				this.plugin.settings.fileOpenMode = value as 'default' | 'source' | 'preview';
				await this.plugin.saveSettings();
			}));
			
		new Setting(containerEl).setName('Styles').setHeading();
		
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
			.setName(t('Enable Animation and Blur'))
			.setDesc(t('Toggle to enable or disable animation and blur effects.'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAnimation)
				.onChange(async (value) => {
					this.plugin.settings.enableAnimation = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('Show File View Header'))
			.setDesc(t('Show the header of the file view in the modal window'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showFileViewHeader)
				.onChange(async (value) => {
					this.plugin.settings.showFileViewHeader = value;
					await this.plugin.saveSettings();
					this.plugin.applyStyles();
				}));

		new Setting(containerEl)
			.setName(t('Show Link View Header'))
			.setDesc(t('Show the header of the link view in the modal window'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showLinkViewHeader)
				.onChange(async (value) => {
					this.plugin.settings.showLinkViewHeader = value;
					await this.plugin.saveSettings();
					this.plugin.applyStyles();
				}));

		new Setting(containerEl).setName('Custom Commands').setHeading();

		new Setting(containerEl)
			.setName(t("Add Custom Command"))
			.setDesc(t("Add a new custom command"))
			.addButton((button) => button
				.setButtonText(t("Add"))
				.onClick(() => {
					this.addCustomCommand();
				}));

		// 显示现有的自定义命令
		const customCommandsContainer = containerEl.createDiv("custom-commands-container");
		this.plugin.settings.customCommands.forEach((command, index) => {
			this.createCustomCommandSetting(customCommandsContainer, command, index);
		});
	}

	addCustomCommand() {
		const newCommand: CustomCommand = {
			name: "",
			command: ""
		};
		this.plugin.settings.customCommands.push(newCommand);
		this.plugin.saveSettings();
		this.display();
	}

	createCustomCommandSetting(containerEl: HTMLElement, command: CustomCommand, index: number) {
		const setting = new Setting(containerEl)
			.addText((text) => text
				.setPlaceholder(t("Command Name"))
				.setValue(command.name)
				.onChange(async (value) => {
					command.name = value;
					await this.plugin.saveSettings();
				}))
			.addText((text) => text
				.setPlaceholder(t("Description"))
				.setValue(command.command)
				.onChange(async (value) => {
					command.command = value;
					await this.plugin.saveSettings();
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
	}
}
