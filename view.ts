import { ItemView, Workspace, WorkspaceLeaf } from "obsidian";
import  globalLink  from "./main";

export const LINK_VIEW = "link-view";

export class LinkView extends ItemView {
	link: string;
	workspace: Workspace;

	constructor(workspace: Workspace, leaf: WorkspaceLeaf, link: string) {
		super(leaf);
		this.workspace = workspace;
		this.link = (globalLink as unknown as { link: string }).link;
	}

	getViewType() {
		return LINK_VIEW;
	}

	getDisplayText() {
		return "External Link View";
	}

	setLink(link: string) {
		this.link = link;
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		const frame = container.createEl("iframe");
		frame.src = this.link;
		frame.setAttribute("frameborder", "0");
		frame.width = "100%";
		frame.height = "100%";
	}

	async onClose() {}
}