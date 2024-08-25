import { App, PluginSettingTab, Setting } from "obsidian";
import ModalOpenPlugin from "./main";

export interface ModalOpenPluginSettings {
	openMethod: "drag" | "middle" | "both";
	modalWidth: string;
	modalHeight: string;
	dragThreshold: number; // 添加拖拽时间阈值设置
}

export const DEFAULT_SETTINGS: ModalOpenPluginSettings = {
	openMethod: "drag",
	modalWidth: "76vw",
	modalHeight: "86vh",
	dragThreshold: 100, // 默认拖拽时间阈值
};

export default class ModalOpenSettingTab extends PluginSettingTab {
	plugin: ModalOpenPlugin;
	openMethod: string;
	modalWidth: string;
	modalHeight: string;
	dragThreshold: number; // 添加拖拽时间阈值设置

	constructor(app: App, plugin: ModalOpenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		// Initialize settings with default values or plugin settings
		this.openMethod = this.plugin.settings.openMethod;
		this.modalWidth = this.plugin.settings.modalWidth;
		this.modalHeight = this.plugin.settings.modalHeight;
		this.dragThreshold = this.plugin.settings.dragThreshold;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h1", { text: "Modal Opener Settings" });

		new Setting(containerEl)
		.setName("Open modal window with")
		.addDropdown((dd) =>
			dd
				.addOption("drag", "drag and drop")
				.addOption("middle", "mouse middle")
				.addOption("both", "both")
				.setValue(this.plugin.settings.openMethod)
				.onChange(async (value: "drag" | "middle" | "both") => {
					this.plugin.settings.openMethod = value;
					await this.plugin.saveSettings();
					this.display(); // 重新渲染设置页面
				})
		);

		if (this.plugin.settings.openMethod === "drag" || this.plugin.settings.openMethod === "both") {
			new Setting(containerEl)
			.setName("Drag and drop time threshold")
			.setDesc("Set the minimum drag and drop time (in milliseconds) to trigger the link to open. When set to 0, it will trigger immediately.")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.dragThreshold))
					.onChange(async (value) => {
						const numValue = Number(value);
						if (!isNaN(numValue) && numValue >= 0) {
							this.plugin.settings.dragThreshold = numValue;
							await this.plugin.saveSettings();
						}
					})
			);
		}

		containerEl.createEl("h1", { text: "Modal Window Settings" });

		new Setting(containerEl)
			.setName("Modal width")
			.setDesc("Enter any valid CSS unit")
			.addText((text) =>
				text
					.setValue(this.modalWidth) // Use instance property
					.onChange(async (value) => {
						this.plugin.settings.modalWidth = value;
						this.modalWidth = value; // Update instance property
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Modal height")
			.setDesc("Enter any valid CSS unit")
			.addText((text) =>
				text
					.setValue(this.modalHeight) // Use instance property
					.onChange(async (value) => {
						this.plugin.settings.modalHeight = value;
						this.modalHeight = value; // Update instance property
						await this.plugin.saveSettings();
					})
			);
	}
}
