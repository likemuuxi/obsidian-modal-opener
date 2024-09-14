# 🎉Obsidian Modal Plugin

English Doc｜[中文文档](https://github.com/likemuuxi/obsidian-modal-plugin/blob/main/README-ZH.md)

> This is a plugin that uses the Obsidian modal window to open files and links.
> It can be combined with other plug-ins to easily read and edit various types of files, block various interferences for you.



![image](https://github.com/user-attachments/assets/dd59221d-701e-4ca6-9235-807c2b5ea1fa)



![image](https://github.com/user-attachments/assets/f826b237-f1b9-4b3a-bf1b-2b2c43a32325)



![image](https://github.com/user-attachments/assets/c4784538-03d7-4ad2-bd91-8bdb8d07461b)



![image](https://github.com/user-attachments/assets/9c9a4099-45e8-42c6-af70-3f0d3a6de41a)



![image](https://github.com/user-attachments/assets/c3999325-1531-4ec2-b2b7-07c974240711)



# ✨Feature

- Support Markdown file titles and block link anchor jumps
- Support switching between editing modes
- Double click the modal border to restore to the tab
- Support setting shortcut keys to open current files and links
- Support adding custom commands, one click opening of files or links (can be combined with Command plugin to add icons)

# 🎯How to use

- Reading mode
  - Right click menu
  - Drag and drop
  - Middle mouse button
  - `alt` + Left mouse button

- Edit mode
  - Right click menu

# 🪒How to install

## Manual installation

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Install by BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) Plugin. 
2. Add "Modal Plugin" to BRAT:
   1. Go to *Settings > BRAT > Beta Plugin List*
   2. Click on "Add Beta plugin"
   3. Enter `https://github.com/likemuuxi/obsidian-modal-plugin`
   4. Click on Add Plugin
3. After installation, enable the plugin to use it

# 🚧Compatibility

Currently known plugins with conflicts.

- `no dupe leave`
- `mononote`
- `float search`
- `Templify`

> Notice: When loading a Web page using the `surfing` plugin, do not turn on the **option to open a web page in a fixed and unique tab**. This affects the plugin's functionality.

# 🥰Special thanks

Special thanks to these amazing plugins! I use these plugins as a reference for developing my first public plugin. The basic structure of this plugin is mainly based on [obidian link opener]( https://github.com/zorazrr/obsidian-link-opener ). I referred to other plugins and completed the modal window file display and plugin restart functions.

- [obsidian-link-opener](https://github.com/zorazrr/obsidian-link-opener) by zorazrr
- [Obsidian-Float-Search](https://github.com/Quorafind/Obsidian-Float-Search) by Quorafind
- [obsidian-copilot](https://github.com/logancyang/obsidian-copilot) by logancyang
- [Cursor](https://www.cursor.com/) 、[ChatGPT](https://chatgpt.com/)

