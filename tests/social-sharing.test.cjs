const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  React = require("react"),
  { create, act } = require("react-test-renderer");
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (id) => (id in mocks ? mocks[id] : require(id)),
      URL,
      console,
      process: { env: { APP_URL: "https://treatstory.vercel.app" } },
      ...globals,
    },
  );
  return module.exports;
}
const image = load("src/lib/image-loader.ts");
const social = load("src/lib/social-metadata.ts", {
  "../../public/img/share-preview.jpg": {
    __esModule: true,
    default: { src: "/img/share-preview.jpg", width: 1200, height: 630 },
  },
  "@/lib/image-loader": image,
});
test("product previews use public name/photo/description without prices, inventory or private fields", () => {
  const record = {
    name: "Chocolate Cake",
    status: "published",
    description: "Handmade cake\nwith cocoa",
    price: 8675309,
    stockQuantity: 98412,
    ownerEmail: "private@example.test",
    internalNotes: "secret note",
    imageUrls: [
      "https://res.cloudinary.com/shop/image/upload/f_auto/v123/cake.webp",
    ],
  };
  const value = social.productSocialMetadata(record, "seller:cake-1", true),
    text = JSON.stringify(value);
  assert.equal(value.title, "Chocolate Cake");
  assert.match(value.description, /Handmade cake with cocoa/);
  assert.match(value.openGraph.url, /seller%3Acake-1$/);
  assert.doesNotMatch(text, /8675309|98412|private@example|secret note/);
  const photo = value.openGraph.images[0];
  assert.equal(photo.type, "image/jpeg");
  assert.equal(photo.width, 1200);
  assert.ok(photo.url.indexOf("f_jpg") > photo.url.indexOf("f_auto"));
  assert.match(photo.url, /v123\/cake.webp$/);
});
test("draft and missing products never reveal their private names or images in previews", () => {
  for (const record of [
    null,
    {
      name: "Private draft secret",
      status: "draft",
      description: "Hidden details",
      imageUrls: ["https://example.test/private.jpg"],
    },
  ]) {
    const value = social.productSocialMetadata(record, "seller:hidden", true);
    assert.equal(value.robots.index, false);
    assert.doesNotMatch(
      JSON.stringify(value),
      /Private draft secret|Hidden details|private.jpg/,
    );
  }
});
test("unsafe images use the brand preview and signed image paths are preserved", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://user:pass@example.test/x",
    "/img/product-placeholder.svg",
  ])
    assert.match(
      social.productSocialImage(value, "Cake").url,
      /share-preview.jpg$/,
    );
  const signed =
    "https://res.cloudinary.com/shop/image/upload/s--signature--/v12/cake.jpg";
  assert.equal(social.productSocialImage(signed, "Cake").url, signed);
});
test("social metadata reads current data on each request and rejects nested document paths", async () => {
  let calls = 0;
  const records = {
    "marketplace_products/cake": {
      name: "First name",
      status: "published",
      description: "First details",
      imageUrls: [],
    },
    "marketplace_products/draft": {
      name: "Private draft secret",
      status: "draft",
    },
  };
  const { getProductSocialMetadata } = load(
    "src/lib/server/product-social-metadata.ts",
    {
      "@/lib/social-metadata": social,
      "@/lib/document-id": load("src/lib/document-id.ts"),
      "@/lib/server/firebase-admin": {
        getServerFirebase: () => ({
          db: {
            collection: (kind) => ({
              doc: (id) => ({
                get: async () => {
                  calls++;
                  return {
                    exists: !!records[kind + "/" + id],
                    data: () => records[kind + "/" + id],
                  };
                },
              }),
            }),
          },
        }),
      },
    },
  );
  assert.equal(
    (await getProductSocialMetadata("seller:cake")).title,
    "First name",
  );
  records["marketplace_products/cake"].name = "Latest name";
  assert.equal(
    (await getProductSocialMetadata("seller:cake")).title,
    "Latest name",
  );
  assert.equal(calls, 2);
  assert.doesNotMatch(
    JSON.stringify(await getProductSocialMetadata("seller:draft")),
    /Private draft secret/,
  );
  const before = calls;
  await getProductSocialMetadata("seller:bad/path");
  assert.equal(calls, before);
});
function shareFixture(navigator) {
  const calls = [],
    notices = [],
    prevented = [];
  const { ProductShareButton } = load(
    "src/components/product-share-button.tsx",
    {
      "lucide-react": {
        Share2: () => null,
        Copy: () => null,
        MessageCircle: () => null,
      },
      "@/components/ui/button": { Button: "button" },
      "@/components/ui/popover": {
        Popover: "div",
        PopoverTrigger: ({ children }) => children,
        PopoverContent: ({ children }) =>
          React.createElement("section", null, children),
      },
      "@/hooks/use-toast": {
        useToast: () => ({ toast: (x) => notices.push(x) }),
      },
      "@/lib/user-notices": { errorToast: () => ({ title: "Copy failed" }) },
    },
    {
      navigator,
      window: {
        location: {
          origin: "https://treatstory.vercel.app",
          href: "https://treatstory.vercel.app/product/cake?private=discard",
        },
        open: (...args) => calls.push(args),
      },
    },
  );
  let tree;
  act(() => {
    tree = create(
      React.createElement(ProductShareButton, {
        productRoute: "seller:cake-1",
        title: "Chocolate Cake",
      }),
    );
  });
  return {
    tree,
    calls,
    notices,
    prevented,
    button: (label) =>
      tree.root.findAllByType("button").find((x) => x.children.includes(label)),
  };
}
test("copy and WhatsApp sharing use a clean product URL without current query parameters", async () => {
  const copied = [],
    f = shareFixture({
      clipboard: { writeText: async (value) => copied.push(value) },
    });
  await act(async () => {
    await f.button("Copy product link").props.onClick();
  });
  assert.equal(
    copied[0],
    "https://treatstory.vercel.app/product/seller%3Acake-1",
  );
  assert.equal(f.notices[0].title, "Product link copied");
  act(() => f.button("Share on WhatsApp").props.onClick());
  const url = new URL(f.calls[0][0]);
  assert.equal(url.hostname, "wa.me");
  assert.match(url.searchParams.get("text"), /Chocolate Cake/);
  assert.doesNotMatch(url.searchParams.get("text"), /private=discard/);
  assert.equal(f.calls[0][2], "noopener,noreferrer");
  act(() => f.tree.unmount());
});
test("native sharing sends the product data and cancellation is quiet", async () => {
  for (const canceled of [false, true]) {
    const shared = [],
      f = shareFixture({
        share: async (value) => {
          shared.push(value);
          if (canceled)
            throw Object.assign(Error("Canceled"), { name: "AbortError" });
        },
      });
    await act(async () => {
      f.button("Share").props.onClick({ preventDefault() {} });
      await Promise.resolve();
    });
    assert.equal(
      shared[0].url,
      "https://treatstory.vercel.app/product/seller%3Acake-1",
    );
    assert.equal(f.notices.length, 0);
    act(() => f.tree.unmount());
  }
});
