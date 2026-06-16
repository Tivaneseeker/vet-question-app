# 兽医单选刷题 PWA

一个极简中文单选刷题应用，技术栈为 React + Vite + TypeScript + IndexedDB + PWA。数据只保存在本机浏览器，不需要登录、后台或网络服务。

## 运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址。构建生产版本：

```bash
npm run build
npm run preview
```

## CSV 题库格式

导入文件必须是 UTF-8 CSV，表头固定为：

```csv
分类,题干,A,B,C,D,E,正确答案,解析
```

`正确答案` 只填写 `A`、`B`、`C`、`D`、`E` 中的一个。`E` 和 `解析` 可以为空，但表头必须保留。

## 使用 Python 工具整理题库

工具位置：

```bash
python tools/extract_questions.py
```

默认只读取：

```text
F:\vet-question-app\input
F:\vet-question-app\input_ocr
```

默认输出：

```text
F:\vet-question-app\output\questions.csv
F:\vet-question-app\output\needs_review.csv
```

`questions.csv` 是应用可直接导入的题库；无法识别正确答案的题会进入 `needs_review.csv`，人工补上 `正确答案` 后也可以导入应用。

如果需要指定目录：

```bash
python tools/extract_questions.py --input F:\vet-question-app\input --input F:\vet-question-app\input_ocr --output F:\vet-question-app\output
```

PDF 读取依赖可复制文字。如果 PDF 是扫描图片，请先 OCR 成 Word 或可复制文字 PDF。

## 导入题库

1. 打开应用首页。
2. 点“导入题库”。
3. 选择 `questions.csv`。
4. 导入后回首页，点“开始刷题”或“分类刷题”。

所有题库和错题本保存在 IndexedDB，刷新页面不会丢失。清空数据可在“导入题库”页面执行。

## 部署

先构建：

```bash
npm run build
```

把 `dist` 目录部署到任意静态网站服务，例如 Nginx、Vercel、Netlify、GitHub Pages 或 Cloudflare Pages。PWA 和 iPhone 添加主屏幕要求使用 HTTPS；本地测试可用 `localhost`。

## 在 iPhone 主屏幕安装

1. 用 Safari 打开已部署的 HTTPS 地址。
2. 点击底部分享按钮。
3. 选择“添加到主屏幕”。
4. 确认名称“兽医刷题”并添加。

添加后从主屏幕打开，会以独立 PWA 窗口运行。首次打开并加载完成后，基础页面资源会被 service worker 缓存。
