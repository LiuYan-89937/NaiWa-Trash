# 奶蛙回收站

Rust + Tauri 的 macOS / Windows 透明桌面回收站。现有跳跃、思考、受惊、挥手、眨眼、捧腹大笑、放屁动作和新张嘴动作已内置。

## 使用

- 把文件或文件夹拖到奶蛙身上：张嘴迎接，松手后移入系统废纸篓，播放碎纸吞咽效果。
- 只拖过、不松手，不移动文件。回收失败的项目会显示错误，且不计入成功投喂数量。
- 吃完后固定捧腹大笑，配合内置原版笑声，约 12.5 秒。播放素材去掉了原音频开头约 0.45 秒及尾部的静音，声音预加载完成后再同步启动画面，动作保持原有节奏。动画持续到音频结束，离线也可播放。
- 待机以眨眼为主，默认持续 30–90 秒后随机穿插一次跳跃、思考或挥手，再回到眨眼。穿插动作按随机顺序轮换，避免连续重复。拖入文件会立即中断待机，投喂结束后自动恢复。
- 放屁不属于投喂随机动作；整个系统废纸篓成功清理后才播放。
- 单击奶蛙播放受惊；按住本体移动即可拖动，拖动不会触发受惊。底部移动按钮也可使用。齿轮或右键打开黄底绿字的简洁设置页。菜单栏 / 托盘也可打开设置或退出。
- 点击奶蛙底部的「−」可收起；macOS 菜单栏或 Windows 系统托盘的奶蛙菜单可重新显示、收起、打开设置或退出。收起后程序继续运行，启用的自动清理仍会按设置执行。
- macOS 不显示 Dock 图标；Windows 的奶蛙和设置窗口都不显示任务栏图标。
- 跳跃使用重新生成的 8 帧素材，导入时按眨眼站立帧校准体型和脚底基准，整段保持同一个比例，保留腾空位移。
- 奶蛙与碎纸效果按原尺寸的 80% 显示，尺寸系数在 `config/defaults.json` 的 `runtime.pet.scale` 中统一维护。
- 碎纸效果使用折角纸卡、逐条分离的弯曲纸带和吸入口中的轨迹；多个文件依次进入。
- 文件仍在系统废纸篓时可通过 Finder / 资源管理器恢复；清空后为永久删除。

## 清理规则

自动清理默认关闭。设置页只保留自动清理开关、清理方式与阈值，以及手动清理。可选择一种清理方式：

1. 自上一个周期开始经过指定小时数；
2. 整个系统废纸篓的回收项目数达到阈值；
3. 整个系统废纸篓的容量达到阈值。

检查周期默认 30 秒，仅在奶蛙进程运行时执行。修改清理设置会重新开始计时。退出期间不执行后台清理，重新启动后按保存的计时继续。失败后等待 5 分钟再尝试，避免连续打扰。

清理范围包括其他程序和用户手动放入的文件。macOS 文件夹按一个顶层回收项目计数；Windows 使用系统回收站报告的项目数。容量包含文件夹内容，不跟随符号链接；容量读取不完整时禁用当次容量触发，数量和时间条件仍可独立触发。

文件操作在 Rust 后端串行执行，避免回收与清空同时修改废纸篓。前端只接收真实原生拖放产生的一次性令牌，没有任意路径删除接口。设置和操作摘要原子写入系统应用数据目录。

## macOS

需要 Node.js 22.12+、Rust 1.90+、Xcode Command Line Tools。

```sh
npm ci
npm run app:dev
```

打包当前 Mac 架构：

```sh
npm run package:mac
```

产物：

- `src-tauri/target/release/bundle/macos/奶蛙回收站.app`
- `src-tauri/target/release/bundle/dmg/` 下的 DMG

首次读取或操作废纸篓时，系统会请求奶蛙控制 Finder。需要允许，相关开关在「系统设置 → 隐私与安全性 → 自动化」。读取容量可能还需要访问相关目录。应用不会修改 Finder 的清空确认偏好。

当前使用本机默认签名方式，未配置开发者证书、公证或 App Store 发布。

## Windows 打包

需要：

- Node.js 22.12 或更新版本；
- Rust stable 的 MSVC 工具链，版本不低于 1.90；
- Visual Studio 2022 Build Tools 的「使用 C++ 的桌面开发」及 Windows SDK；
- WebView2 Runtime。NSIS 安装包会按 Tauri 默认策略安装缺少的运行时。

把整个工程复制到 Windows 后，在工程目录执行：

```powershell
npm ci
npm run package:windows
```

也可双击 `scripts/build-windows.cmd`。安装包位于 `src-tauri/target/release/bundle/nsis/`，名称以 `-setup.exe` 结尾，默认仅安装到当前用户，无须管理员安装模式。

如需指定 x64：

```powershell
rustup target add x86_64-pc-windows-msvc
npm run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis
```

如需 ARM64，先安装 Visual Studio 的 C++ ARM64 构建组件：

```powershell
rustup target add aarch64-pc-windows-msvc
npm run tauri -- build --target aarch64-pc-windows-msvc --bundles nsis
```

## 代码与素材

- `src-tauri/src/platform/`：macOS Finder / Windows Shell 系统废纸篓适配。
- `src-tauri/src/service.rs`：回收、清理条件、投喂反馈与历史记录。
- `src-tauri/src/lib.rs`：原生拖放授权、窗口、托盘、IPC 和定时检查。
- `src/controller.js`：待机、拖入、投喂、点击、清理完成的播放队列。
- `src/animator.js`：按素材原始时序播放透明帧，读取动作的尺寸校准与音频信息。
- `src/idle-state-machine.js`：可中断的待机状态机，以眨眼为常驻动作，偶尔穿插其他动作。
- `src/pet-gesture.js`：区分单击和按住拖动。
- `src/shredder.js`：文件纸卡分裂、碎片轨迹和吸入口中的效果。
- `config/defaults.json`：默认设置、待机时间、阈值、交互与碎纸参数。
- `config/assets.json`：动作来源与声音文件、音量、来源署名。
- `public/pet/catalog.json`：动作目录和播放时序；`public/pet/frames/`：内置 PNG 帧。

资源已复制到工程，打包不依赖相邻的动画工程。`scripts/import-assets.mjs` 仅供后续从原动画工程同步已认可的素材。

`preview.html` 复用应用的帧动画播放器，可通过 `npm run dev` 打开 `/preview.html` 预览带声音的大笑。`scripts/export-preview.mjs <目标目录>` 可导出独立静态预览。音频的剪辑范围记录在 `config/assets.json`；如需重建播放素材，安装 FFmpeg 后运行 `node scripts/prepare-audio.mjs`，再运行素材导入脚本。打包直接使用已准备好的素材，不要求安装 FFmpeg。

## 检查

```sh
npm run check:syntax
```

该命令仅解析 JavaScript、JSON 和 Rust 语法，不启动应用，不执行文件回收/清空，不运行类型检查或功能测试。正式打包由 Tauri 构建流程完成。文件拖放和真实清理由用户实机验收。

角色原始参考：[yugh6/Naiwa](https://github.com/yugh6/Naiwa)。原版笑声来自 yugh6（握石竹）在该项目提供的[原版笑声.wav](https://github.com/yugh6/Naiwa/blob/main/原版笑声.wav)。原文件保留为 `public/pet/audio/laugh.wav`，实际播放 `laugh-playback.wav`。参考许可保留在 `public/pet/reference-LICENCE`，音频所附 PolyForm Noncommercial License 1.0.0 保留在 `public/pet/audio/source-LICENCE`。

框架文档：[Tauri 环境准备](https://v2.tauri.app/start/prerequisites/)、[Windows 打包](https://v2.tauri.app/distribute/windows-installer/)。
