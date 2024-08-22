import { App, Modal, TFile, WorkspaceLeaf, MarkdownView, ViewState, View } from "obsidian";
import LinkOpenPlugin from "./main";

export class LinkModal extends Modal {
    plugin: LinkOpenPlugin;
    link: string;
    width: string;
    height: string;
    file?: TFile;
    leaf?: WorkspaceLeaf;
    private view: MarkdownView | undefined;

    constructor(plugin: LinkOpenPlugin, link: string, file?: TFile, width?: string, height?: string) {
        super(plugin.app);
        this.plugin = plugin;
        this.link = link;
        this.width = width || '80%';
        this.height = height || '80%';
        this.file = file;
    }

    async onOpen() {
        if (!this.contentEl) {
            console.error("contentEl is undefined");
            return;
        }
    
        // Modal Size
        const modalContainer = this.containerEl.lastChild as HTMLElement;
        if (modalContainer) {
            modalContainer.style.width = this.width;
            modalContainer.style.height = this.height;
        }
    
        // Display content based on file or link
        if (this.file) {
            await this.displayFileContent(this.file);
        } else {
            this.displayLinkContent();
        }
    }

    onClose() {
        if (this.leaf) {
            // 清理 leaf
            this.leaf.detach();
            this.leaf = undefined;
        }
        const { contentEl } = this;
        contentEl.empty();
    }

    async displayFileContent(file: TFile) {
        if (!this.contentEl) {
            console.error("contentEl 在 displayFileContent 中未定义");
            return;
        }
    
        const containerEl = this.contentEl.createEl("div", { cls: "modal-file-container" });
        containerEl.style.width = "100%";
        containerEl.style.height = "100%";
        containerEl.style.overflow = "auto";
    
        // 获取一个新的 leaf
        const leaf = this.app.workspace.getLeaf(true); // 使用 getLeaf 代替 splitLeaf
        await leaf.openFile(file, { state: { mode: 'preview' } });
    
        const viewHeader = leaf.view.containerEl.querySelector('.view-header');
        if (viewHeader) {
            viewHeader.classList.add('plugin-modal-hidden-view-header');
        }
        
        // 添加所需的 CSS 类
        const modal = leaf.view.containerEl.closest('.plugin-modal');
        if (modal) {
            modal.classList.add(
                'plugin-modal-hide-scrollbar',
                'markdown-preview-view',
                'markdown-rendered',
                'node-insert-event',
                'is-readable-line-width',
                'allow-fold-headings',
                'show-indentation-guide',
                'allow-fold-lists',
                'show-properties'
            );
        }
        
        // 将 leaf 的视图添加到 containerEl
        containerEl.appendChild(leaf.view.containerEl);
    
        // 保存 leaf 引用，以便在关闭时清理
        this.leaf = leaf;
    }

    displayLinkContent() {
        if (!this.contentEl) {
            console.error("contentEl is undefined in displayLinkContent");
            return;
        }
    
        this.contentEl.addClass("link-modal");
        const frame = this.contentEl.createEl("iframe");
        frame.src = this.link;
        frame.setAttribute("frameborder", "0");
        frame.style.width = "100%";
        frame.style.height = "100%";
        //frame.style.height = "calc(100% - 50px)"; // 减去按钮的高度
    
        // 创建一个容器来包裹按钮
        // const buttonContainer = this.contentEl.createEl("div", { cls: "button-container" });
        // buttonContainer.style.display = "flex";
        // buttonContainer.style.justifyContent = "center";
        // buttonContainer.style.alignItems = "center";
        // buttonContainer.style.height = "30px"; // 设置按钮容器的高度
    
        // 创建按钮并添加容器中
        // const button = buttonContainer.createEl("button", { text: "Open in Browser" });
        // button.onclick = () => {
        //     window.open(this.link);
        //     this.close();
        // };
        // button.addClass("modal-button");
    }
}