import { Modal, TFile, WorkspaceLeaf , MarkdownView } from "obsidian";
import ModalOpenPlugin from "./main";

export class ModalWindow extends Modal {
    plugin: ModalOpenPlugin;
    leaf?: WorkspaceLeaf;
    link: string;
    file?: TFile;
    fragment: string
    width: string;
    height: string;

    constructor(plugin: ModalOpenPlugin, link: string, file?: TFile, fragment?: string, width?: string, height?: string) {
        super(plugin.app);
        this.plugin = plugin;
        this.link = link;
        this.file = file;
        this.fragment = fragment || '';
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
            await this.displayFileContent(this.file, this.fragment);
        } else {
            this.displayLinkContent();
        }
    }

    onClose() {
        if (this.leaf && this.fragment == '') {
            // 清理 leaf
            this.leaf.detach();
            this.leaf = undefined;
        }
        if (this.fragment)
        {
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            if (leaves.length > 0) {
                const latestLeaf = leaves[leaves.length - 1];
                latestLeaf.detach(); // 关闭最新的标签页
            } else {
                console.error("No open tab");
            }
        }
        const { contentEl } = this;
        contentEl.empty();
    }

    async displayFileContent(file: TFile, fragment: string) {
        if (!this.contentEl) {
            console.error("contentEl is undefined in displayFileContent.");
            return;
        }
    
        this.contentEl.empty();
        this.contentEl.addClass("file-modal");
    
        // 创建文件内容容器
        const fileContainer = this.contentEl.createEl("div", { cls: "file-modal-container" });
        fileContainer.style.flexGrow = "1";
        fileContainer.style.position = "relative";
        fileContainer.style.overflow = "auto";
    
        let mode: 'source' | 'preview';
        switch (this.plugin.settings.fileOpenMode) {
            case 'source':
                mode = 'source';
                break;
            case 'preview':
                mode = 'preview';
                break;
            default:
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                mode = activeView?.getMode() === 'source' ? 'source' : 'preview';
        }

        if (fragment) {
            const filePath = `${file.path}#${fragment}`;
            console.log("filePath", filePath);
            // 获取当前标签页的文件
            const currentLeaf = this.app.workspace.getLeaf();
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                if (currentLeaf) {
                    // 使用 duplicateLeaf 复制当前标签页
                    const newLeaf = await this.app.workspace.duplicateLeaf(currentLeaf, 'tab');
                    await newLeaf.openFile(activeFile);
                }
            } else {
                console.error("No activate file");
            }
    
            setTimeout(() => {
                this.app.workspace.openLinkText(filePath, file.path, false);
            }, 150);
    
            // 查找新打开的leaf
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);  // 注意这里添加了括号来调用方法
            if (view && view instanceof MarkdownView) {
                // 获取当前的 view 状态
                const currentState = view.getState();
                // 更新模式
                currentState.mode = mode;
                // 更新视图状态
                view.setState(currentState, { history: false });
                // 将新打开的view嵌入到modal中
                fileContainer.appendChild(view.containerEl);
                this.contentEl.addEventListener('keydown', (event: KeyboardEvent) => {
                    if (event.ctrlKey && event.key === 'e') {
                        event.preventDefault();
                        (view as any).toggleMode();
                    }   
                });
            }
        } else {
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(file, { state: { mode } });

            if (leaf.view instanceof MarkdownView) {
                const view = leaf.view;
                this.contentEl.addEventListener('keydown', (event: KeyboardEvent) => {
                    if (event.ctrlKey && event.key === 'e') {
                        event.preventDefault();
                        (view as any).toggleMode();
                    }
                });
            }
            // 隐藏标签页
            // (leaf as any).tabHeaderEl.style.display = 'none';
            fileContainer.appendChild(leaf.view.containerEl);
            this.leaf = leaf;
        }
        this.contentEl.tabIndex = -1;
        this.contentEl.focus();
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