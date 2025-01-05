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
	enableRounding: boolean;
	clickWithoutAlt: boolean;
	onlyCloseButton: boolean;
	disableExcalidrawEsc: boolean;
	customCommands: CustomCommand[];
	showFileViewHeader: boolean;
	showLinkViewHeader: boolean;
	showMetadata: boolean;
	hideTabHeader: boolean;
	preventsDuplicateTabs: boolean;
	delayInMs: number;
	modalOpenDelay: number;
	enableRefreshOnClose: boolean;
	showFloatingButton: boolean;
	viewOfDisplayButton: string;
	enabledCommands: {
        markdown: boolean;
        canvas: boolean;
        excalidraw: boolean;
        diagrams: boolean;
        tldraw: boolean;
        excel: boolean;
        sheetPlus: boolean;
        vscode: boolean;
        markmind: boolean;
        dataloom: boolean;
    };
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
	enableRounding: false,
	clickWithoutAlt: false,
	onlyCloseButton: false,
	disableExcalidrawEsc: true,
	customCommands: [],
	showFileViewHeader: false,
	showLinkViewHeader: false,
	showMetadata: false,
	hideTabHeader: true,
	preventsDuplicateTabs: false,
	delayInMs: 100,
	modalOpenDelay: 0,
	enableRefreshOnClose: true,
	showFloatingButton: true,
	viewOfDisplayButton: 'both',
	enabledCommands: {
        markdown: true,
        canvas: true,
        excalidraw: true,
        diagrams: true,
        tldraw: true,
        excel: true,
        sheetPlus: true,
        vscode: true,
        markmind: true,
        dataloom: true
    }
};

export default class ModalOpenerSettingTab extends PluginSettingTab {
	plugin: ModalOpenerPlugin;
	openMethod: string;
	fileOpenMode: string;
	modalWidth: string;
	modalHeight: string;
	dragThreshold: number;
	enableAnimation: boolean;
	enableRounding: boolean;
	clickWithoutAlt: boolean;
	onlyCloseButton: boolean;
	disableExcalidrawEsc: boolean;
	customCommands: CustomCommand[];
	showFileViewHeader: boolean;
	showLinkViewHeader: boolean;
	showMetadata: boolean;
	hideTabHeader: boolean;
	preventsDuplicateTabs: boolean;
	delayInMs: number;
	modalOpenDelay: number;
	enableRefreshOnClose: boolean;
	showFloatingButton: boolean;
	viewOfDisplayButton: string;
	enabledCommands: {
        markdown: boolean;
        canvas: boolean;
        excalidraw: boolean;
        diagrams: boolean;
        tldraw: boolean;
        excel: boolean;
        sheetPlus: boolean;
        vscode: boolean;
        markmind: boolean;
        dataloom: boolean;
    };

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
		
		new Setting(containerEl).setName(t('Behavior')).setHeading();

		if (this.plugin.settings.openMethod === "altclick" || this.plugin.settings.openMethod === "both") {
			new Setting(containerEl)
				.setName(t("Single-click trigger"))
				.setDesc(t("If enabled, clicking links will open them in modal window without holding Alt."))
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.clickWithoutAlt)
					.onChange(async (value) => {
						this.plugin.settings.clickWithoutAlt = value;
						await this.plugin.saveSettings();
						await this.reloadPlugin();
					}));
		}
		
		new Setting(containerEl)
			.setName(t('Disable external click close'))
			.setDesc(t('Use only the Close button and Esc to close.'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.onlyCloseButton)
				.onChange(async (value) => {
					this.plugin.settings.onlyCloseButton = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('Excalidraw Disables the Esc key'))
			.setDesc(t('Disable Esc key to close modal when editing Excalidraw'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.disableExcalidrawEsc)
				.onChange(async (value) => {
					this.plugin.settings.disableExcalidrawEsc = value;
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
			.setName(t('Enable modal window rounding'))
			.setDesc(t('Toggle to enable or disable modal window rounding'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRounding)
				.onChange(async (value) => {
					this.plugin.settings.enableRounding = value;
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

		if (!Platform.isMobile) {
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
		}
		
		new Setting(containerEl).setName(t('Menu item')).setHeading();
		
		new Setting(containerEl)
			.setName(t('Modal window open delay'))
			.setDesc(t('Set the delay (in milliseconds) before opening modal window after creating new file.'))
			.addSlider(slider => slider
				.setLimits(0, 5000, 50)
				.setValue(this.plugin.settings.modalOpenDelay)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.modalOpenDelay = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setDesc(t('Toggle menu items to show or hide in the right-click context menu'));
		// 创建一个容器用于横向排列
		const commandsContainer = containerEl.createDiv('command-toggle-container');

		// Markdown
		new Setting(commandsContainer)
			.setClass('command-toggle-item')
			.setName('Markdown')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabledCommands.markdown)
				.onChange(async (value) => {
					this.plugin.settings.enabledCommands.markdown = value;
					await this.plugin.saveSettings();
			}));
			
		// Canvas
		const canvasPlugin = (this.app as any).internalPlugins.getEnabledPluginById("canvas");
		if (canvasPlugin) {
			new Setting(commandsContainer)
				.setClass('command-toggle-item')
				.setName('Canvas')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.enabledCommands.canvas)
					.onChange(async (value) => {
						this.plugin.settings.enabledCommands.canvas = value;
						await this.plugin.saveSettings();
					}));
		}
		
		// Excalidraw
		this.createPluginSetting(
			commandsContainer,
			"obsidian-excalidraw-plugin",
			"Excalidraw",
			"excalidraw"
		);

		// Excalidraw
		this.createPluginSetting(
			commandsContainer,
			"obsidian-excalidraw-plugin-ymjr",
			"Excalidraw-ymjr",
			"excalidraw"
		);

		// Diagrams
		this.createPluginSetting(
			commandsContainer,
			"obsidian-diagrams-net",
			"Diagrams",
			"diagrams"
		);

		// Tldraw
		this.createPluginSetting(
			commandsContainer,
			"tldraw",
			"Tldraw",
			"tldraw"
		);

		// Excel
		this.createPluginSetting(
			commandsContainer,
			"excel",
			"Excel",
			"excel"
		);

		// Sheet Plus
		this.createPluginSetting(
			commandsContainer,
			"sheet-plus",
			"Sheet Plus",
			"sheetPlus"
		);

		// VSCode
		this.createPluginSetting(
			commandsContainer,
			"vscode-editor",
			"Code File",
			"vscode"
		);

		// Markmind
		this.createPluginSetting(
			commandsContainer,
			"obsidian-markmind",
			"MarkMind",
			"markmind"
		);

		// Dataloom
		this.createPluginSetting(
			commandsContainer,
			"notion-like-tables",
			"Dataloom",
			"dataloom"
		);

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

	// 添加一个通用的创建插件设置的函数
	private createPluginSetting(
		container: HTMLElement,
		pluginId: string,
		displayName: string,
		settingKey: keyof typeof this.plugin.settings.enabledCommands
	) {
		const plugin = this.plugin.getPlugin(pluginId);
		const setting = new Setting(container).setClass('command-toggle-item');
		
		if (plugin) {
			// 如果插件存在且选项未设置过,则默认启用
			if (this.plugin.settings.enabledCommands[settingKey] === undefined) {
				this.plugin.settings.enabledCommands[settingKey] = true;
				this.plugin.saveSettings();
			}
	
			setting
				.setName(displayName)
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.enabledCommands[settingKey])
					.onChange(async (value) => {
						this.plugin.settings.enabledCommands[settingKey] = value;
						await this.plugin.saveSettings();
					}));
		} else {
			setting
				.setName(displayName)
				.setDesc(t('Plugin is not enabled or installed'))
				.addButton(button => button
					.setButtonText(t('Details'))
					.onClick(async () => {
						// (this.app as any).setting.open();
						// (this.app as any).setting.openTabById('community-plugins');
						// new Notice('Please search and install the plugin: ' + displayName);
						// window.open(`https://obsidian.md/plugins?id=${pluginId}`, '_blank');

						let repoUrl = `https://obsidian.md/plugins?id=${pluginId}`;
						if(pluginId == "obsidian-excalidraw-plugin-ymjr") {
							repoUrl = "https://github.com/Bowen-0x00/obsidian-excalidraw-plugin-ymjr";
						} else if (pluginId == "obsidian-diagrams-net") {
							repoUrl = "https://github.com/likemuuxi/obsidian-diagrams-net";
						}
                    	window.open(repoUrl, '_blank');
					}));
		}
		return setting;
	}
}