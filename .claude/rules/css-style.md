# CSS/Style Guide Rules

## 1. 样式系统与框架
- 避免直接写 `style="..."` 行内样式，除非是动态计算的值。

## 2. 命名规范
- 使用驼峰式(CamelCase)或中划线(kebab-case)保持全项目一致（推荐：kebab-case）。

## 3. 结构与优先级
- 样式声明顺序：定位(positioning) -> 盒子模型(box model) -> 布局(flex/grid) -> 字体(typography) -> 视觉效果(visuals)。

## 4. 颜色与变量
- 使用项目定义的 CSS 变量（如 `var(--primary-color)`），严禁硬编码颜色十六进制值。