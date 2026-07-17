import { expect, test, type Browser, type Page } from "@playwright/test";

const fineControlHeights = { sm: 30, md: 38, lg: 42 } as const;
const coarseControlHeights = { sm: 44, md: 44, lg: 44 } as const;

type ControlHeights = typeof fineControlHeights | typeof coarseControlHeights;

async function openDarkLogin(
  browser: Browser,
  baseURL: string,
  hasTouch: boolean,
) {
  const context = await browser.newContext({
    baseURL,
    colorScheme: "dark",
    hasTouch,
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript(() => localStorage.setItem("theme", "dark"));

  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/(^| )dark( |$)/);
  return { context, page };
}

async function expectControlHeights(page: Page, expected: ControlHeights) {
  await page.evaluate(() => {
    const probes = document.createElement("div");
    probes.dataset.testid = "control-size-probes";
    probes.style.cssText =
      "position:absolute;inset:0 auto auto 0;display:flex;gap:4px;z-index:-1";

    for (const size of ["sm", "md", "lg"] as const) {
      const control = document.createElement("button");
      control.dataset.testid = `control-${size}`;
      control.textContent = size;
      control.style.cssText = `height:var(--control-${size});width:var(--control-${size})`;
      probes.append(control);
    }

    document.body.append(probes);
  });

  for (const size of ["sm", "md", "lg"] as const) {
    const bounds = await page.getByTestId(`control-${size}`).boundingBox();
    expect(bounds?.height).toBe(expected[size]);
    expect(bounds?.width).toBe(expected[size]);
  }
}

async function expectOperatorTriggerSize(page: Page, expectedHeight: number) {
  await page.evaluate(() => {
    const trigger = document.createElement("button");
    trigger.dataset.slot = "dropdown-menu-trigger";
    trigger.dataset.testid = "operator-trigger";
    trigger.className =
      "flex min-h-[var(--control-sm)] items-center gap-2 rounded-lg px-2 py-1.5 text-sm";

    const avatar = document.createElement("span");
    avatar.className = "flex size-7 shrink-0 items-center justify-center";
    avatar.textContent = "O";
    const username = document.createElement("span");
    username.className = "hidden font-medium sm:inline";
    username.textContent = "operator";
    const chevron = document.createElement("span");
    chevron.className = "size-4";
    trigger.append(avatar, username, chevron);
    document.body.append(trigger);
  });

  const bounds = await page.getByTestId("operator-trigger").boundingBox();
  expect(bounds?.height).toBe(expectedHeight);
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
}

async function expectBookmarkLinkSize(page: Page, expectedHeight: number) {
  await page.evaluate(() => {
    const card = document.createElement("article");
    card.className = "flex";
    card.style.width = "214px";
    const link = document.createElement("a");
    link.dataset.testid = "bookmark-link";
    link.href = "https://git.inspotstore.com/";
    link.ariaLabel = "Gitea";
    link.className =
      "flex min-h-[var(--control-sm)] min-w-0 flex-1 items-start gap-3 no-underline";
    const icon = document.createElement("span");
    icon.className = "size-10 shrink-0";
    const content = document.createElement("span");
    content.textContent = "Gitea";
    link.append(icon, content);
    card.append(link);
    document.body.append(card);
  });

  const bounds = await page.getByTestId("bookmark-link").boundingBox();
  expect(bounds?.height).toBe(expectedHeight);
  expect(bounds?.width).toBe(214);
}

function contrastRatio(
  foreground: readonly [number, number, number],
  background: readonly [number, number, number],
) {
  const luminance = ([red, green, blue]: readonly [number, number, number]) => {
    const linearize = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * linearize(red) +
      0.7152 * linearize(green) +
      0.0722 * linearize(blue)
    );
  };

  const values = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function compositeRgb(
  foreground: readonly [number, number, number],
  background: readonly [number, number, number],
  opacity: number,
): [number, number, number] {
  return [
    Math.round(foreground[0] * opacity + background[0] * (1 - opacity)),
    Math.round(foreground[1] * opacity + background[1] * (1 - opacity)),
    Math.round(foreground[2] * opacity + background[2] * (1 - opacity)),
  ];
}

test("dark secondary text passes contrast on every foundation surface", async ({
  baseURL,
  browser,
}) => {
  expect(baseURL).toBeTruthy();
  const { context, page } = await openDarkLogin(browser, baseURL!, false);

  try {
    const samples = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const canvasContext = canvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!canvasContext) throw new Error("2D canvas context is unavailable");

      const toRgb = (color: string): [number, number, number] => {
        canvasContext.clearRect(0, 0, 1, 1);
        canvasContext.fillStyle = color;
        canvasContext.fillRect(0, 0, 1, 1);
        const [red, green, blue] = canvasContext.getImageData(0, 0, 1, 1).data;
        return [red, green, blue];
      };

      const rootStyle = getComputedStyle(document.documentElement);
      const textColors = {
        foreground400: `oklch(${rootStyle.getPropertyValue("--foreground-400")})`,
        foreground500: `oklch(${rootStyle.getPropertyValue("--foreground-500")})`,
        secondary: rootStyle.getPropertyValue("--text-secondary"),
        muted: rootStyle.getPropertyValue("--text-muted"),
      };
      const surfaces = {
        app: rootStyle.getPropertyValue("--surface-app"),
        card: rootStyle.getPropertyValue("--surface-card"),
        sunken: rootStyle.getPropertyValue("--surface-sunken"),
      };

      return Object.entries(textColors).flatMap(([textName, textColor]) =>
        Object.entries(surfaces).map(([surfaceName, surfaceColor]) => ({
          name: `${textName}/${surfaceName}`,
          background: toRgb(surfaceColor),
          foreground: toRgb(textColor),
        })),
      );
    });

    for (const sample of samples) {
      expect(
        contrastRatio(sample.foreground, sample.background),
        sample.name,
      ).toBeGreaterThanOrEqual(4.5);
    }
  } finally {
    await context.close();
  }
});

test("bookmark URL keeps passing contrast throughout its entrance animation", async ({
  baseURL,
  browser,
}) => {
  expect(baseURL).toBeTruthy();
  const { context, page } = await openDarkLogin(browser, baseURL!, false);

  try {
    const sample = await page.evaluate(() => {
      const section = document.createElement("section");
      section.className = "animate-fade-in";
      const card = document.createElement("article");
      card.className = "bg-background-50";
      const url = document.createElement("p");
      url.className = "mt-1 truncate text-xs text-foreground-400";
      url.textContent = "https://git.inspotstore.com/";
      card.append(url);
      section.append(card);
      document.body.append(section);

      const animation = section.getAnimations()[0];
      if (!animation) throw new Error("Bookmark entrance animation is missing");
      animation.pause();
      animation.currentTime = 167;

      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const canvasContext = canvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!canvasContext) throw new Error("2D canvas context is unavailable");
      const toRgb = (color: string): [number, number, number] => {
        canvasContext.fillStyle = color;
        canvasContext.fillRect(0, 0, 1, 1);
        const [red, green, blue] = canvasContext.getImageData(0, 0, 1, 1).data;
        return [red, green, blue];
      };

      return {
        background: toRgb(getComputedStyle(card).backgroundColor),
        foreground: toRgb(getComputedStyle(url).color),
        opacity: Number.parseFloat(getComputedStyle(section).opacity),
      };
    });
    const effectiveForeground = compositeRgb(
      sample.foreground,
      sample.background,
      sample.opacity,
    );

    expect(
      contrastRatio(effectiveForeground, sample.background),
      "bookmark URL at the formerly 3.62:1 entrance-animation frame",
    ).toBeGreaterThanOrEqual(4.5);
  } finally {
    await context.close();
  }
});

test("control tokens keep desktop density and reach 44px for coarse pointers", async ({
  baseURL,
  browser,
}) => {
  expect(baseURL).toBeTruthy();

  const fine = await openDarkLogin(browser, baseURL!, false);
  try {
    expect(
      await fine.page.evaluate(() => matchMedia("(pointer: fine)").matches),
    ).toBe(true);
    await expectControlHeights(fine.page, fineControlHeights);
    await expectOperatorTriggerSize(fine.page, 40);
    await expectBookmarkLinkSize(fine.page, 40);
  } finally {
    await fine.context.close();
  }

  const coarse = await openDarkLogin(browser, baseURL!, true);
  try {
    expect(
      await coarse.page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);
    await expectControlHeights(coarse.page, coarseControlHeights);
    await expectOperatorTriggerSize(coarse.page, 44);
    await expectBookmarkLinkSize(coarse.page, 44);
  } finally {
    await coarse.context.close();
  }
});

test("interactive cursors follow semantics while utilities keep precedence", async ({
  baseURL,
  browser,
}) => {
  expect(baseURL).toBeTruthy();
  const { context, page } = await openDarkLogin(browser, baseURL!, false);

  try {
    const cursors = await page.evaluate(() => {
      const appendProbe = (
        element: HTMLElement,
        testId: string,
        className?: string,
      ) => {
        element.dataset.testid = testId;
        element.textContent = testId;
        if (className) element.className = className;
        document.body.append(element);
        return element;
      };

      const button = appendProbe(
        document.createElement("button"),
        "cursor-button",
      );
      const link = appendProbe(
        document.createElement("a"),
        "cursor-link",
      ) as HTMLAnchorElement;
      link.href = "/login";
      const roleButton = appendProbe(
        document.createElement("div"),
        "cursor-role-button",
      );
      roleButton.setAttribute("role", "button");

      const nativeDisabled = appendProbe(
        document.createElement("button"),
        "cursor-native-disabled",
      ) as HTMLButtonElement;
      nativeDisabled.disabled = true;
      const ariaDisabled = appendProbe(
        document.createElement("a"),
        "cursor-aria-disabled",
      ) as HTMLAnchorElement;
      ariaDisabled.href = "/login";
      ariaDisabled.setAttribute("aria-disabled", "true");
      const dataDisabled = appendProbe(
        document.createElement("div"),
        "cursor-data-disabled",
      );
      dataDisabled.setAttribute("role", "button");
      dataDisabled.setAttribute("data-disabled", "");

      const anchorWithoutHref = appendProbe(
        document.createElement("a"),
        "cursor-anchor-without-href",
      );
      const grab = appendProbe(
        document.createElement("button"),
        "cursor-grab",
        "cursor-grab active:cursor-grabbing",
      );
      const wait = appendProbe(
        document.createElement("button"),
        "cursor-wait",
        "cursor-wait",
      );
      const explicitNotAllowed = appendProbe(
        document.createElement("button"),
        "cursor-explicit-not-allowed",
        "cursor-not-allowed",
      );
      const resize = appendProbe(
        document.createElement("button"),
        "cursor-resize",
        "cursor-e-resize",
      );

      return {
        button: getComputedStyle(button).cursor,
        link: getComputedStyle(link).cursor,
        roleButton: getComputedStyle(roleButton).cursor,
        nativeDisabled: getComputedStyle(nativeDisabled).cursor,
        ariaDisabled: getComputedStyle(ariaDisabled).cursor,
        dataDisabled: getComputedStyle(dataDisabled).cursor,
        anchorWithoutHref: getComputedStyle(anchorWithoutHref).cursor,
        grab: getComputedStyle(grab).cursor,
        wait: getComputedStyle(wait).cursor,
        explicitNotAllowed: getComputedStyle(explicitNotAllowed).cursor,
        resize: getComputedStyle(resize).cursor,
      };
    });

    expect(cursors).toEqual({
      button: "pointer",
      link: "pointer",
      roleButton: "pointer",
      nativeDisabled: "not-allowed",
      ariaDisabled: "not-allowed",
      dataDisabled: "not-allowed",
      anchorWithoutHref: "auto",
      grab: "grab",
      wait: "wait",
      explicitNotAllowed: "not-allowed",
      resize: "e-resize",
    });

    const grab = page.getByTestId("cursor-grab");
    await grab.hover();
    await page.mouse.down();
    try {
      await expect(grab).toHaveCSS("cursor", "grabbing");
    } finally {
      await page.mouse.up();
    }
  } finally {
    await context.close();
  }
});
