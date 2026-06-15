import { defineConfig } from "vitepress";
import type { DefaultTheme } from "vitepress";

const logo = {
  light: "/ome-logo-nav.png",
  dark: "/ome-logo-nav.png",
  alt: "Oh My Experience",
};

const socialLinks: DefaultTheme.SocialLink[] = [
  { icon: "github", link: "https://github.com/rennzhang/oh-my-experience" },
];

const search: DefaultTheme.Config["search"] = {
  provider: "local",
  options: {
    locales: {
      zh: {
        translations: {
          button: {
            buttonText: "搜索",
            buttonAriaLabel: "搜索文档",
          },
          modal: {
            displayDetails: "显示详情",
            resetButtonTitle: "清空搜索",
            backButtonTitle: "关闭搜索",
            noResultsText: "没有找到结果",
            footer: {
              selectText: "选择",
              navigateText: "切换",
              closeText: "关闭",
            },
          },
        },
      },
    },
  },
};

const englishNav: DefaultTheme.NavItem[] = [
  { text: "Start", link: "/guides/introduction" },
  { text: "Guides", link: "/guides/" },
  { text: "Reference", link: "/reference/" },
];

const chineseNav: DefaultTheme.NavItem[] = [
  { text: "开始", link: "/zh/guides/introduction" },
  { text: "指南", link: "/zh/guides/" },
  { text: "参考", link: "/zh/reference/" },
];

const englishSidebar: DefaultTheme.Sidebar = {
  "/guides/": [
    {
      text: "Start here",
      items: [
        { text: "Introduction", link: "/guides/introduction" },
        { text: "Quickstart", link: "/guides/quickstart" },
        { text: "First experience card", link: "/guides/first-card" },
        { text: "Examples", link: "/guides/examples" },
      ],
    },
    {
      text: "Build the library",
      items: [
        { text: "Source scan", link: "/guides/source-scan" },
        { text: "Reflect and review", link: "/guides/reflect-review" },
        { text: "Global and project libraries", link: "/guides/project-libraries" },
      ],
    },
    {
      text: "Agent setup",
      items: [
        { text: "Setup", link: "/guides/setup" },
        { text: "Codex", link: "/guides/codex" },
        { text: "Claude", link: "/guides/claude" },
      ],
    },
    {
      text: "Validation",
      items: [
        { text: "Evaluation", link: "/guides/evaluation" },
      ],
    },
  ],
  "/reference/": [
    {
      text: "Reference",
      items: [
        { text: "Overview", link: "/reference/" },
        { text: "CLI", link: "/reference/cli" },
        { text: "Config", link: "/reference/config" },
      ],
    },
  ],
  "/architecture/": [
    {
      text: "Maintainer concepts",
      items: [
        { text: "Overview", link: "/architecture/" },
        { text: "Data model", link: "/architecture/data-model" },
        { text: "Hook runtime", link: "/architecture/hook-runtime" },
        { text: "Retrieval engine", link: "/architecture/retrieval-engine" },
        { text: "Evaluation harness", link: "/architecture/evaluation-harness" },
        { text: "Internationalization", link: "/architecture/i18n" },
        { text: "Applicability flow", link: "/architecture/applicability-flow" },
        { text: "Category flow", link: "/architecture/category-flow" },
      ],
    },
  ],
  "/": [
    {
      text: "Start here",
      items: [
        { text: "Introduction", link: "/guides/introduction" },
        { text: "Quickstart", link: "/guides/quickstart" },
        { text: "First experience card", link: "/guides/first-card" },
        { text: "Examples", link: "/guides/examples" },
      ],
    },
    {
      text: "Build the library",
      items: [
        { text: "Source scan", link: "/guides/source-scan" },
        { text: "Reflect and review", link: "/guides/reflect-review" },
        { text: "Global and project libraries", link: "/guides/project-libraries" },
      ],
    },
    {
      text: "Agent setup",
      items: [
        { text: "Setup", link: "/guides/setup" },
        { text: "Codex", link: "/guides/codex" },
        { text: "Claude", link: "/guides/claude" },
        { text: "Evaluation", link: "/guides/evaluation" },
      ],
    },
  ],
};

const chineseSidebar: DefaultTheme.Sidebar = {
  "/zh/guides/": [
    {
      text: "从这里开始",
      items: [
        { text: "介绍", link: "/zh/guides/introduction" },
        { text: "快速开始", link: "/zh/guides/quickstart" },
        { text: "第一张经验卡", link: "/zh/guides/first-card" },
        { text: "实际案例", link: "/zh/guides/examples" },
      ],
    },
    {
      text: "建设经验库",
      items: [
        { text: "来源扫描", link: "/zh/guides/source-scan" },
        { text: "复盘与审阅", link: "/zh/guides/reflect-review" },
        { text: "全局与项目经验库", link: "/zh/guides/project-libraries" },
      ],
    },
    {
      text: "Agent 设置",
      items: [
        { text: "安装配置", link: "/zh/guides/setup" },
        { text: "Codex", link: "/zh/guides/codex" },
        { text: "Claude", link: "/zh/guides/claude" },
      ],
    },
    {
      text: "验证",
      items: [
        { text: "评估", link: "/zh/guides/evaluation" },
      ],
    },
  ],
  "/zh/reference/": [
    {
      text: "参考",
      items: [
        { text: "总览", link: "/zh/reference/" },
        { text: "CLI", link: "/zh/reference/cli" },
        { text: "配置", link: "/zh/reference/config" },
      ],
    },
  ],
  "/zh/architecture/": [
    {
      text: "维护者概念",
      items: [
        { text: "总览", link: "/zh/architecture/" },
        { text: "数据模型", link: "/zh/architecture/data-model" },
        { text: "Hook runtime", link: "/zh/architecture/hook-runtime" },
        { text: "召回引擎", link: "/zh/architecture/retrieval-engine" },
        { text: "评估体系", link: "/zh/architecture/evaluation-harness" },
        { text: "国际化", link: "/zh/architecture/i18n" },
        { text: "适用范围流程", link: "/zh/architecture/applicability-flow" },
        { text: "分类流程", link: "/zh/architecture/category-flow" },
      ],
    },
  ],
  "/zh/": [
    {
      text: "从这里开始",
      items: [
        { text: "总览", link: "/zh/" },
        { text: "快速开始", link: "/zh/guides/quickstart" },
        { text: "第一张经验卡", link: "/zh/guides/first-card" },
        { text: "实际案例", link: "/zh/guides/examples" },
      ],
    },
    {
      text: "建设经验库",
      items: [
        { text: "来源扫描", link: "/zh/guides/source-scan" },
        { text: "复盘与审阅", link: "/zh/guides/reflect-review" },
        { text: "全局与项目经验库", link: "/zh/guides/project-libraries" },
      ],
    },
    {
      text: "Agent 设置",
      items: [
        { text: "安装配置", link: "/zh/guides/setup" },
        { text: "Codex", link: "/zh/guides/codex" },
        { text: "Claude", link: "/zh/guides/claude" },
        { text: "评估", link: "/zh/guides/evaluation" },
      ],
    },
  ],
};

function themeConfig(
  locale: "en" | "zh",
  nav: DefaultTheme.NavItem[],
  sidebar: DefaultTheme.Sidebar,
): DefaultTheme.Config {
  const isChinese = locale === "zh";

  return {
    logo,
    siteTitle: "Oh My Experience",
    nav,
    sidebar,
    socialLinks,
    search,
    outline: {
      label: isChinese ? "本页内容" : "On this page",
    },
    editLink: {
      pattern: "https://github.com/rennzhang/oh-my-experience/edit/main/docs/:path",
      text: isChinese ? "在 GitHub 编辑此页" : "Edit this page on GitHub",
    },
    docFooter: {
      prev: isChinese ? "上一页" : "Previous page",
      next: isChinese ? "下一页" : "Next page",
    },
    lastUpdated: {
      text: isChinese ? "最后更新" : "Last updated",
    },
    darkModeSwitchLabel: isChinese ? "外观" : "Appearance",
    lightModeSwitchTitle: isChinese ? "切换到浅色模式" : "Switch to light theme",
    darkModeSwitchTitle: isChinese ? "切换到深色模式" : "Switch to dark theme",
    sidebarMenuLabel: isChinese ? "菜单" : "Menu",
    returnToTopLabel: isChinese ? "回到顶部" : "Return to top",
    langMenuLabel: isChinese ? "切换语言" : "Change language",
    footer: {
      message: isChinese
        ? "面向 AI coding agents 的本地优先经验召回。"
        : "Local-first experience recall for AI coding agents.",
      copyright: "MIT Licensed",
    },
  };
}

export default defineConfig({
  title: "Oh My Experience",
  description: "A local-first experience layer for AI coding agents.",
  cleanUrls: true,
  srcExclude: ["internal/**"],
  lastUpdated: true,
  ignoreDeadLinks: [
    /^https?:\/\/localhost/,
  ],
  head: [
    ["link", { rel: "icon", type: "image/x-icon", href: "/favicon.ico?v=ome-logo-20260613" }],
    ["link", { rel: "icon", type: "image/png", href: "/ome-logo-favicon.png?v=ome-logo-20260613" }],
    ["link", { rel: "apple-touch-icon", href: "/ome-logo-favicon.png?v=ome-logo-20260613" }],
    ["meta", { name: "theme-color", content: "#111827" }],
    ["meta", { property: "og:title", content: "Oh My Experience" }],
    ["meta", { property: "og:description", content: "Stop teaching your agent the same lesson twice." }],
    ["meta", { property: "og:image", content: "/ome-logo.png" }],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      title: "Oh My Experience",
      description: "A local-first experience layer for AI coding agents.",
      themeConfig: themeConfig("en", englishNav, englishSidebar),
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh/",
      title: "Oh My Experience",
      description: "面向 AI coding agents 的本地优先经验层。",
      themeConfig: themeConfig("zh", chineseNav, chineseSidebar),
    },
  },
});
