# Obsidian Modal Plugin



> 这是一个使用 Obsidian 模态窗口打开文件和链接的插件。可以搭配其他插件，实现便捷阅读和编辑各种类型文件



![](https://muuxi-oss.oss-cn-hangzhou.aliyuncs.com/img/%E3%80%90Obsidian%E3%80%91modal-plugin-240830.png)



![](https://muuxi-oss.oss-cn-hangzhou.aliyuncs.com/img/%E3%80%90Obsidian%E3%80%91modal-plugin-240830_1.png)



## How to use

- 阅读模式
  - 右键菜单选项
  - 鼠标拖拽打开
  - 鼠标中键打开
  - `alt + 左键`
- 编辑模式
	- 右键菜单



## Compatibility

支持文件类型
- Markdown
	- 支持标题链接、块链接锚点跳转
- Canvas
- Excalidraw
- Code file
- Web
- Draw.io
- ...

## Todo

- [ ] 支持拖动打开 Draw.io 文件进行编辑

- [ ] 和标签页的互转，双击还原标签页
- [ ] 支持设置侧边栏图标，一键打开文件或链接（支持 command ）
- [ ] ...



## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).

- Publish an initial version.

- Make sure you have a `README.md` file in the root of your repo.

- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

  

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Improve code quality with eslint (optional)
- [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code. 
- To use eslint with this project, make sure to install eslint from terminal:
  - `npm install -g eslint`
- To use eslint to analyze this project use this command:
  - `eslint main.ts`
  - eslint will then create a report with suggestions for code improvement by file and line number.
- If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder:
  - `eslint .\src\`



# Recommended Plugins
- Surfing
- Excel
- Diagrams.net
- Excalidraw
- Component（💰pay）

# Special Thanks

Special thanks to these amazing plugins! I used these plugins as a reference for developing my first public plugin. The plugin basic structure is mainly based on the [obsidian-link-opener](https://github.com/zorazrr/obsidian-link-opener). I referred to other plugins and completed the display of files in the modal window and plugin restart function.

- [obsidian-link-opener](https://github.com/zorazrr/obsidian-link-opener) by zorazrr
- [Obsidian-Float-Search](https://github.com/Quorafind/Obsidian-Float-Search) by Quorafind
- [obsidian-copilot](https://github.com/logancyang/obsidian-copilot) by logancyang
- [Cursor](https://www.cursor.com/) 、[ChatGPT](https://chatgpt.com/)



## API Documentation

See https://github.com/obsidianmd/obsidian-api



## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```



