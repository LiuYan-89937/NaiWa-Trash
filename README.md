# 奶蛙回收站

Rust + Tauri 实现的 macOS / Windows 桌面回收站。把文件拖给奶蛙，它会张嘴接住、播放碎纸效果，再捧腹大笑。文件进入系统废纸篓，清空后奶蛙放屁。

[下载安装包与 Windows 源码包](https://github.com/LiuYan-89937/NaiWa-Trash/releases/latest)

## 使用

- 单击本体播放受惊；按住移动即可拖动奶蛙。
- 待机以眨眼为主，随机穿插跳跃、思考和挥手。
- 投喂成功后播放约 12.5 秒的大笑与原版笑声。
- 黄底绿字的简洁设置页支持按时间、数量或容量自动清理，自动清理默认关闭。
- 清理范围是**整个系统废纸篓**，清空后文件会永久删除。

## 本地开发与打包

需要 Node.js 22.12+、Rust 1.90+，以及对应平台的构建工具。

```sh
cd naiwa-trash
npm ci
npm run app:dev
```

macOS 打包：`npm run package:mac`；Windows 打包：`npm run package:windows`。

Windows 需要 Visual Studio Build Tools 的 C++ 桌面开发组件和 Windows SDK。完整环境准备、安装包位置、源码结构见 [应用说明](naiwa-trash/README.md)。

## 工程目录

- `naiwa-trash/`：可独立构建的桌面应用，包含 Rust 后端、界面、动作和声音。
- `naiwa-animation/`：角色素材与动画制作工程。
- `releases/`：本机生成的安装包和源码压缩包，已排除出 Git 提交。

代码验证使用 `npm run check:syntax`，只解析语法；真实文件拖放和清理由使用者实机验收。

## 素材来源

角色原始参考和笑声音源来自 [yugh6 / Naiwa](https://github.com/yugh6/Naiwa)，作者为 yugh6（握石竹）。相关许可随素材保留在工程中，详见 [应用说明中的素材署名](naiwa-trash/README.md#代码与素材)。
