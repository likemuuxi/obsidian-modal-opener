import { Modal, TFile, WorkspaceLeaf } from "obsidian";
import ModalOpenPlugin from "./main";

export class ModalWindow extends Modal {
    plugin: ModalOpenPlugin;
    leaf?: WorkspaceLeaf;
    link: string;
    file?: TFile;
    width: string;
    height: string;

    constructor(plugin: ModalOpenPlugin, link: string, file?: TFile, width?: string, height?: string) {
        super(plugin.app);
        this.plugin = plugin;
        this.link = link;
        this.file = file;
        this.width = width || '80%';
        this.height = height || '80%';
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
            console.error("contentEl is undefined in displayFileContent.");
            return;
        }
    
        this.contentEl.empty();
        this.contentEl.addClass("file-modal");
        // this.addNavButtons(this.contentEl);
        // 创建文件内容容器
        const fileContainer = this.contentEl.createEl("div", { cls: "file-modal-container" });
        fileContainer.style.flexGrow = "1";
        fileContainer.style.position = "relative";
        fileContainer.style.overflow = "auto";
    
        // 创建一个临时的 WorkspaceLeaf
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.openFile(file, { state: { mode: 'preview' } });

        // 隐藏标签页
        (leaf as any).tabHeaderEl.style.display = 'none';

        // 将 leaf 的视图添加到 container
        fileContainer.appendChild(leaf.view.containerEl);

        // 保存 leaf 引用，以便在关闭时清理
        this.leaf = leaf;

        // 添加链接点击事件监听器
        this.addLinkClickListener(fileContainer);
    }

    private addLinkClickListener(container: HTMLElement) {
        container.addEventListener('click', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const closestAnchor = target.closest('a');
            
            if (closestAnchor && closestAnchor.hasClass('external-link')) {
                evt.preventDefault();
                evt.stopImmediatePropagation(); // 阻止事件传播和其他监听器的执行
                const href = closestAnchor.getAttribute('href');
                if (href) {
                    this.link = href;
                    this.contentEl.empty();
                    this.displayLinkContent();
                }
            }
        }, true); // 使用捕获阶段
    }

    displayLinkContent() {
        if (!this.contentEl) {
            console.error("contentEl is undefined in displayLinkContent.");
            return;
        }
        this.contentEl.empty();
        this.contentEl.addClass("link-modal");
        // this.addNavButtons(this.contentEl);
        const linkContainer = this.contentEl.createEl("div", { cls: "link-modal-container" });
        linkContainer.style.flexGrow = "1";
        linkContainer.style.position = "relative";
        linkContainer.style.overflow = "auto";
    
        const frame = linkContainer.createEl("iframe");
        frame.src = this.link;
        frame.style.width = "100%";
        frame.style.height = "100%";
        frame.style.border = "none";
        frame.style.position = "absolute";
        frame.style.top = "0";
        frame.style.left = "0";
    }

    // private addNavButtons(container: HTMLElement) {
    //     const navButtons = container.createEl("div", { cls: "view-header-nav-buttons" });
        
    //     const createButton = (label: string, icon: string, disabled: boolean) => {
    //         const button = navButtons.createEl("button", {
    //             cls: "clickable-icon",
    //             attr: {
    //                 "aria-label": label,
    //                 "aria-disabled": disabled.toString()
    //             }
    //         });
    //         button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-${icon}"><path d="${icon === 'arrow-left' ? 'm12 19-7-7 7-7' : 'M5 12h14'}"></path><path d="${icon === 'arrow-left' ? 'M19 12H5' : 'm12 5 7 7-7 7'}"></path></svg>`;
    //         return button;
    //     };
    
    //     createButton("返回", "arrow-left", false);
    //     createButton("前进", "arrow-right", true);
    // }
}