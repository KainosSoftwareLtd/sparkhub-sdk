/**
 * Wire-compatibility guard over the LIVE viewer schema: the custom block /
 * inline types (and their prop keys) must match what SparkHub's editor schema
 * stores. If this test fails after a BlockNote bump or a spec change, stored
 * documents would stop round-tripping — fix the spec, not the test.
 */
import { describe, expect, it } from "vitest";
import { viewerSchema, viewerSchemaInfo } from "./schema";

describe("viewerSchema — SparkHub custom-type registration", () => {
  it("registers all five SparkHub custom blocks", () => {
    for (const type of ["mermaid", "callout", "fileAsset", "drawio", "wrappedImage"]) {
      expect(viewerSchema.blockSchema, `block '${type}'`).toHaveProperty(type);
    }
  });

  it("registers both SparkHub custom inline types", () => {
    expect(viewerSchema.inlineContentSchema).toHaveProperty("mention");
    expect(viewerSchema.inlineContentSchema).toHaveProperty("anchor");
  });

  it("keeps prop keys wire-compatible with the SparkHub editor schema", () => {
    expect(Object.keys(viewerSchemaInfo.blocks.callout)).toEqual(["calloutType"]);
    expect(Object.keys(viewerSchemaInfo.blocks.mermaid)).toEqual(["code"]);
    expect(Object.keys(viewerSchemaInfo.blocks.fileAsset).sort()).toEqual(["assetId", "name"]);
    expect(Object.keys(viewerSchemaInfo.blocks.drawio).sort()).toEqual([
      "pngAssetId",
      "sourceAssetId",
    ]);
    expect(Object.keys(viewerSchemaInfo.blocks.wrappedImage).sort()).toEqual([
      "caption",
      "side",
      "url",
      "widthPercent",
    ]);
    const mention = viewerSchemaInfo.inlines.mention;
    const anchor = viewerSchemaInfo.inlines.anchor;
    expect(typeof mention).toBe("object");
    expect(typeof anchor).toBe("object");
    expect(Object.keys(mention as object).sort()).toEqual(["name", "userId"]);
    expect(Object.keys(anchor as object).sort()).toEqual(["kind", "title", "url"]);
  });

  it("keeps the default block set (paragraph/heading/codeBlock/table/…)", () => {
    for (const type of ["paragraph", "heading", "codeBlock", "table", "image", "quote"]) {
      expect(viewerSchema.blockSchema, `block '${type}'`).toHaveProperty(type);
    }
  });
});
