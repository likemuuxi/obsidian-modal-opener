import { App, Plugin, TFile, Menu, TAbstractFile, WorkspaceLeaf, MarkdownView, Notice } from "obsidian";
import LinkOpenPluginSettings, { DEFAULT_SETTINGS } from "./settings";
import { LinkModal } from "./modal";
import LinkOpenSettingTab from "./settings";

export let globalLink = "";

export default class LinkOpenPlugin extends Plugin {
	settings: LinkOpenPluginSettings;
	private modal: LinkModal | undefined;

	async onload() {
		await this.loadSettings();
		this.registerContextMenuHandler();
		this.addSettingTab(new LinkOpenSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private registerContextMenuHandler() {
		// 处理文件菜单
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				this.addFloatPreviewMenuItem(menu, file.path);
			})
		);

		// 处理 URL 菜单（包括 Markdown 链接）
		this.registerEvent(
			this.app.workspace.on("url-menu", (menu: Menu, link: string) => {
				this.addFloatPreviewMenuItem(menu, link);
			})
		);
	}

	private addFloatPreviewMenuItem(menu: Menu, link?: string) {
		menu.addItem((item) =>
			item
				.setTitle("在浮动预览中打开")
				.setIcon("popup-open")
				.setSection("open")
				.onClick(() => {
					if (link) {
						this.openInFloatPreview(link);
					} else {
						new Notice("无法获取链接信息");
					}
				})
		);
	}

	private async openInFloatPreview(link: string) {
		try {
			const file = this.app.metadataCache.getFirstLinkpathDest(link, "");
			this.modal = new LinkModal(
				this,
				file ? "" : link,
				file ?? undefined,
				this.settings.modalWidth,
				this.settings.modalHeight
			);
			this.modal.open();
		} catch (error) {
			console.error("打开浮动预览时出错:", error);
			new Notice("打开浮动预览时出错");
		}
	}
}