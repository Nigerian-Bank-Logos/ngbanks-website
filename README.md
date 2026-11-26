# Nigerian Bank Logos Website

The website for [Nigerian Bank Logos](https://ngbanklogos.com): a free, open-source collection of 500+ Nigerian bank logos for web and mobile apps.

The logos live in a separate repo, [Nigerian-Bank-Logos/ng-bank-logos](https://github.com/Nigerian-Bank-Logos/ng-bank-logos). This repo is only the site that showcases them.

## Getting started

Requires Node.js 22.12 or later.

```sh
npm install
npm run dev      # start the dev server at http://localhost:4321
```

## Scripts

| Command           | What it does                           |
| ----------------- | -------------------------------------- |
| `npm run dev`     | Start the local dev server             |
| `npm run check`   | Type-check `.astro` and `.ts` files    |
| `npm run build`   | Build the static site into `dist/`     |
| `npm run preview` | Serve the built `dist/` folder locally |

Run `npm run check` and `npm run build` before deploying.

## How it works

- Built with [Astro](https://astro.build) as a static site. [GSAP](https://gsap.com) animates the hero and mockups, and [three.js](https://threejs.org) renders the 3D bank in the footer.
- The bank list isn't stored here. The browser fetches it from the logo repo through jsDelivr (`BANKS_CDN_URL` in `src/lib/constants.ts`). New banks added to that repo appear on the site without a redeploy.
- `loadBanks()` in `src/lib/banks.ts` fetches the list once per page load, and the phone mockup, desktop mockup and library all share that request.
- `/library` redirects to the library section on the home page (`/#library`) so old links keep working. It keeps any `?category=` filter.

## Credits

A project by [Onowomano Iluezi-Ogbaudu](https://x.com/onowomano), curated with [Munira Adamu-Ibrahim](https://x.com/TheDesignLuna) and built with [Oluwapelumi Abimbola](https://x.com/pel_UI_mi) & [David Fayemi](https://x.com/KingFayemi).

All bank logos are trademarks of their respective financial institutions.
