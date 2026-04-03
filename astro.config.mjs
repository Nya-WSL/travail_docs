// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
	adapter: vercel({
		webAnalytics: { enabled: true },
	}),
	image: {
		responsiveStyles: true
	},
	integrations: [
		starlight({
			title: 'B站加班姬',
			logo: {
				src: './src/assets/logo.svg',
			},
			locales: {
				root: {
					label: '简体中文',
					lang: 'zh-CN',
				},
			},
			social: [
				{ icon: 'external', label: 'B站', href: 'https://play-live.bilibili.com/details/1765765916387' },
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/Nya-WSL/bili_travail' },
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/Nya-WSL/travail_docs' }
			],
			sidebar: [
				{
					label: '指南',
					autogenerate: { directory: 'guides' }
				},
				{
					label: '关于',
					items: [
						{ label: '联系我们', slug: 'contact' },
						{ label: '特别鸣谢', slug: 'thanks' }
					]
				}
			],
		}),
	],
});
