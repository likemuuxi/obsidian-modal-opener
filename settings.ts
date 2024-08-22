import { App, PluginSettingTab, Setting } from "obsidian";
import LinkOpenPlugin from "./main";

export interface LinkOpenPluginSettings {
	openMethod: string;
	modalWidth: string;
	modalHeight: string;
}

export const DEFAULT_SETTINGS: LinkOpenPluginSettings = {
	openMethod: "modal",
	modalWidth: "80vw",
	modalHeight: "80vh",
};

const openMethods = {
	browser: "Browser",
	modal: "Obsidian Modal",
	tab: "Obsidian Tab",
};

export default class LinkOpenSettingTab extends PluginSettingTab {
	plugin: LinkOpenPlugin;
	openMethod: string;
	modalWidth: string;
	modalHeight: string;

	constructor(app: App, plugin: LinkOpenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		// Initialize settings with default values or plugin settings
		this.openMethod = this.plugin.settings.openMethod;
		this.modalWidth = this.plugin.settings.modalWidth;
		this.modalHeight = this.plugin.settings.modalHeight;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h1", { text: "Link Opener Settings" });

		new Setting(containerEl)
			.setName("Open external links with")
			.addDropdown((dd) =>
				dd
					.addOptions(openMethods)
					.setValue(this.openMethod) // Use instance property
					.onChange(async (value) => {
						this.plugin.settings.openMethod = value;
						this.openMethod = value; // Update instance property
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Modal Settings" });

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
