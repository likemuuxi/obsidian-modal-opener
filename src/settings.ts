import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import ModalOpenPlugin from "./main";
import { t } from "./lang/helpers"

export interface ModalOpenPluginSettings {
	openMethod: "drag" | "middle" | "altClick" | "both";
	fileOpenMode: 'current' | 'source' | 'preview';
	modalWidth: string;
	modalHeight: string;
	dragThreshold: number; // 添加拖拽时间阈值设置
	enableAnimation: boolean; // 添加这一行
}

export const DEFAULT_SETTINGS: ModalOpenPluginSettings = {
	openMethod: "both",
	fileOpenMode: 'current',
	modalWidth: "76vw",
	modalHeight: "86vh",
	dragThreshold: 200, // 默认拖拽时间阈值
	enableAnimation: true, // 添加这一行
};

export default class ModalOpenSettingTab extends PluginSettingTab {
	plugin: ModalOpenPlugin;
	openMethod: string;
	fileOpenMode: string;
	modalWidth: string;
	modalHeight: string;
	dragThreshold: number; // 添加拖拽时间阈值设置
	enableAnimation: boolean; // 添加这一行

	constructor(app: App, plugin: ModalOpenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		// Initialize settings with default values or plugin settings
		this.openMethod = this.plugin.settings.openMethod;
		this.fileOpenMode = this.plugin.settings.fileOpenMode
		this.modalWidth = this.plugin.settings.modalWidth;
		this.modalHeight = this.plugin.settings.modalHeight;
		this.dragThreshold = this.plugin.settings.dragThreshold;
		this.enableAnimation = this.plugin.settings.enableAnimation; // 添加这一行
	}

	async reloadPlugin() {
		try {
			// Save the settings before reloading
			await this.plugin.saveSettings();

			// Reload the plugin
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const app = this.plugin.app as any;
			await app.plugins.disablePlugin("obsidian-modal-plugin");
			await app.plugins.enablePlugin("obsidian-modal-plugin");

			app.setting.openTabById("obsidian-modal-plugin").display();
			// new Notice("Plugin reloaded successfully.");
		} catch (error) {
			// new Notice("Failed to reload the plugin. Please reload manually.");
			// console.error("Error reloading plugin:", error);
		}
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName(t("Open modal window with"))
			.addDropdown((dd) =>
				dd
					.addOption("drag", t("Drag and Drop"))
					.addOption("altClick", t("Alt & Left Click"))
					.addOption("middle", t("Middle Mouse Button"))
					.addOption("both", t("Both"))
					.setValue(this.plugin.settings.openMethod)
					.onChange(async (value: "drag" | "middle" | "altClick" | "both") => { // 更新类型
						this.plugin.settings.openMethod = value;
						await this.plugin.saveSettings();
						await this.reloadPlugin(); // 调用重启插件的方法
						this.display(); // 重新渲染设置页面
					}));

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

		containerEl.createEl("h2", { text: t("Window Settings") });

		new Setting(containerEl)
			.setName(t("Modal width"))
			.setDesc(t("Enter any valid CSS unit"))
			.addText((text) => text
				.setValue(this.modalWidth) // Use instance property
				.onChange(async (value) => {
					this.plugin.settings.modalWidth = value;
					this.modalWidth = value; // Update instance property
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("Modal height"))
			.setDesc(t("Enter any valid CSS unit"))
			.addText((text) => text
				.setValue(this.modalHeight) // Use instance property
				.onChange(async (value) => {
					this.plugin.settings.modalHeight = value;
					this.modalHeight = value; // Update instance property
					await this.plugin.saveSettings();
				}));

		containerEl.createEl("h2", { text: t("Style Settings") });

		new Setting(containerEl)
			.setName(t('Enable Animation and Blur'))
			.setDesc(t('Toggle to enable or disable animation and blur effects.'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAnimation)
				.onChange(async (value) => {
					this.plugin.settings.enableAnimation = value;
					await this.plugin.saveSettings();
				}));
	}
}
