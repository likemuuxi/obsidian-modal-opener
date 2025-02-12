# 🎉Obsidian Modal Opener

中文文档｜[English Doc](https://github.com/likemuuxi/obsidian-modal-plugin/blob/main/README.md)

> 这是一个使用黑曜石模式窗口打开文件和链接的插件。它可以与其他插件结合使用，轻松读取和编辑各种类型的文件，为您提供便利和阻止各种干扰。

![image](https://github.com/user-attachments/assets/dd59221d-701e-4ca6-9235-807c2b5ea1fa)

![image](https://github.com/user-attachments/assets/f826b237-f1b9-4b3a-bf1b-2b2c43a32325)

# ✨Feature

- 支持Markdown文件标题，块链接锚跳转
- 支持切换编辑模式
- 双击模态边框进行恢复到标签页
- 支持使设置快捷键打开当前文件和链接
- 支持添加自定义命令，一键打开文件或链接(可以搭配 Command 插件添加图标)
- 支持右键菜单创建多种文件类型，并在模态窗口中进行编辑，编辑完成后将自动嵌入链接到当前光标位置
  ![image](https://github.com/user-attachments/assets/76e88429-88a4-4ffe-a324-729a9f8ce27d)

  > `Diagrams` 的使用需要安装我的修改版：[obsidian-diagrams-net](https://github.com/likemuuxi/obsidian-diagrams-net)
  > 
  > 使用 `alt+click` 进入模态窗口编辑代码块需要使用 `VSCode Edit` 插件修改版：[下载链接](https://github.com/likemuuxi/obsidian-modal-opener/releases/tag/0.7.8)
  > 

# 🎯How to use

- 阅读模式
  - 拖拽链接
  - 右键菜单
  - `alt` + 鼠标左键
- 编辑模式
  - 右键菜单
  - `alt` + 鼠标左键

# 🪒如何安装

## 从社区安装

[obsidian-modal-opener](https://obsidian.md/plugins?id=modal-opener)

## 手动安装

复制 `main.js`, `styles.css`, `manifest.json` 到你的 Obsidian 库的下面路径 `VaultFolder/.obsidian/plugins/modal-opener/`.

## 通过 BRAT 安装

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件.
2. 添加 "Modal Plugin" 到 BRAT:
   1. 打开 "BRAT" 的社区插件部分
   2. 点击 "Add Beta plugin"
   3. 粘贴如下链接 `https://github.com/likemuuxi/obsidian-modal-plugin`
3. 安装后启用插件即可使用

# 🚧兼容性

## 冲突插件

当前已知的有冲突的插件

- `no dupe leave`
- `mononote`

以上插件都是对重复标签页的处理，现在插件内置重复标签页检测功能，功能来自 `mononote` 插件，在原有基础上有所修改。

# 🥰特别感谢

特别感谢这些惊人的插件!我使用这些插件作为开发我的第一个公共插件的参考。该插件的基本结构主要基于[obsidian-link-opener](https://github.com/zorazrr/obsidian-link-opener)。我参考了其他插件，完成了模态窗口文件显示和阻止重复标签页功能，插件列表如下。

- [obsidian-link-opener](https://github.com/zorazrr/obsidian-link-opener) by zorazrr
- [Obsidian-Float-Search](https://github.com/Quorafind/Obsidian-Float-Search) by Quorafind
- [Obsidian-Surfing](https://github.com/PKM-er/Obsidian-Surfing) by PKM-er
- [obsidian-copilot](https://github.com/logancyang/obsidian-copilot) by logancyang
- [obsidian-mononote](https://github.com/czottmann/obsidian-mononote/tree/main) by czottmann
- [Cursor](https://www.cursor.com/) 、[ChatGPT](https://chatgpt.com/)
