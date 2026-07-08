import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  DEFAULT_SETTINGS,
  DESIGN_TYPES,
  LANGUAGES,
  TEMPLATE_STYLES,
  buildCampaignVariations,
  buildProfessionalDesignPrompt,
  getOpenAIImageSize,
  getSizeInfo,
  isWideFormatDesign
} from "@/lib/studio-data";
import type { CampaignVariation, CanvasSizeInfo, StudioSettings } from "@/types/studio";

export const runtime = "nodejs";

type ReferenceImageMetadata = {
  id?: string;
  name: string;
  role: string;
  type?: string;
  size?: number;
};

type GenerateRequestBody = {
  prompt?: unknown;
  userPrompt?: unknown;
  settings?: Partial<StudioSettings>;
  designType?: unknown;
  selectedDesignType?: unknown;
  language?: unknown;
  selectedLanguage?: unknown;
  templateStyle?: unknown;
  selectedTemplate?: unknown;
  width?: unknown;
  canvasWidth?: unknown;
  height?: unknown;
  canvasHeight?: unknown;
  assetCount?: unknown;
  referenceImages?: ReferenceImageMetadata[];
};

const FRIENDLY_AI_ERROR =
  "AI image generation failed. Please check your OpenAI API key, billing, model access, or internet connection.";
const OPENAI_GENERATION_FAILED_STATUS =
  "OpenAI generation failed. Check billing, model access, quota, or internet connection.";
const LOCAL_FALLBACK_STATUS = ["OpenAI API key missing", "using local fallback template"].join(" \u2014 ");
const WIDE_BACKDROP_BACKGROUND_ONLY_PROMPT =
  "Create a premium wide-format official cyber awareness backdrop background only. Deep navy blue and royal blue cinematic government campaign style, subtle digital grid, circuit lines, cyber security glow, shield and lock decorative patterns, police light accents, clean border, empty center headline space, empty top-left logo area, empty top-right logo area, empty right-side portrait frame area, empty bottom footer/contact strip zone, premium lighting, clean professional public-awareness design base.\n\nIMPORTANT: Do not include any readable text, letters, numbers, words, QR codes, phone numbers, logos, faces, people, portraits, seals, badges, watermarks, or fake official emblems. Leave all text and official assets blank because they will be added later as editable layers.";
const AI_BACKGROUND_NEGATIVE_PROMPT =
  "No text, no letters, no words, no typography, no numbers, no QR code, no barcode, no phone numbers, no social media handles, no URLs, no email addresses, no logos, no police logos, no fake official seals, no readable badges, no readable writing, no faces, no portraits, no human figures, no CP Sir face, no watermarks.";

function makeVariationPrompt(input: {
  userPrompt: string;
  variation: CampaignVariation;
  index: number;
  settings: StudioSettings;
  sizeInfo: CanvasSizeInfo;
  wideFormat: boolean;
}) {
  const { userPrompt, variation, index, settings, sizeInfo, wideFormat } = input;
  const styleLine = wideFormat
    ? [
        "Wide-format backdrop / flex banner background only.",
        index === 0 ? "Variation style: Official Police Blue." : "",
        index === 1 ? "Variation style: Dark Cyber Warning." : "",
        index === 2 ? "Variation style: Clean White Awareness." : "",
        index === 3 ? "Variation style: Ceremony/Flex Banner Style." : ""
      ]
        .filter(Boolean)
        .join(" ")
    : `Variation style: ${variation.name}.`;
  const designType = DESIGN_TYPES.find((item) => item.id === settings.designType)?.label ?? "Campaign creative";
  const visualTheme = userPrompt.trim().slice(0, 420);

  const sharedRules = [
    "Create ONLY a clean background artwork / design base for a professional public-awareness campaign creative.",
    `Design type: ${designType}. Canvas ratio: ${sizeInfo.aspectRatio}.`,
    `Visual theme inspiration from user request: ${visualTheme}. Interpret this as mood, topic, and atmosphere only; do not render any literal words from it.`,
    styleLine,
    "Use premium official campaign styling: polished navy/blue branding, clean white or dark cyber textures, cinematic lighting, alert accents, abstract cyber graphics, decorative shield and lock motifs.",
    "Generate only background artwork, textures, lighting, cyber grid, empty frames, empty layout zones, decorative patterns, borders, and non-readable abstract shapes.",
    "Leave clear empty space for all editable Fabric.js layers: main title, subtitle, body text, alert strip, left logo, right logo, main shield/logo, original locked CP Sir portrait, QR code, footer strip, contact text, social icons, warning icons, border, and safe margin guides.",
    "All readable and official elements will be added later as editable Fabric.js layers. The AI image must not contain final poster text or official identity elements.",
    `NEGATIVE PROMPT - STRICT: ${AI_BACKGROUND_NEGATIVE_PROMPT}`
  ];

  if (wideFormat) {
    return [
      WIDE_BACKDROP_BACKGROUND_ONLY_PROMPT,
      ...sharedRules,
      "Wide-format backdrop/flex banner requirements:",
      "Create a wide official cyber/police background only: deep navy and royal blue gradient, subtle digital circuit patterns, cyber grid, police light glow, abstract shield/lock decorative icons, clean border, and safe margins.",
      "Reserve completely empty zones: top-left logo zone, top-right logo zone, center headline zone, subtitle/body zone, right portrait frame zone, bottom footer/contact strip zone, and QR placement zone.",
      "The center headline area must be empty and visually quiet. The portrait frame must be empty. Logo zones must be empty. Footer/contact strip zone must be empty and free of writing.",
      "Do not create poster copy, event names, campaign names, department names, phone numbers, seals, QR-like squares, badges with letters, or any human face."
    ].join("\n");
  }

  return [
    ...sharedRules,
    "Standard campaign creative requirements:",
    "Create a refined empty design base suitable for a thumbnail/poster/reel cover/flyer: premium background, layered atmosphere, empty title zone, empty subtitle/body zone, empty image/portrait frame zone, empty QR/footer/contact zone, clean border, and readable spacing.",
    "Do not create final headline copy, captions, official logos, QR patterns, social handles, phone numbers, faces, portraits, or readable microtext."
  ].join("\n");
}

async function generateOpenAIImage(input: {
  client: OpenAI;
  model: string;
  prompt: string;
  size: string;
}) {
  const data = await input.client.images.generate({
    model: input.model,
    prompt: input.prompt,
    size: input.size as never,
    quality: "high",
    output_format: "png"
  });

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error(OPENAI_GENERATION_FAILED_STATUS);
  return `data:image/png;base64,${b64}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requestBodyKeys(value: unknown) {
  return isRecord(value) ? Object.keys(value) : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const next = Number(value);
    if (Number.isFinite(next)) return next;
  }
  return undefined;
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function choiceFrom<T extends string>(
  value: unknown,
  items: Array<{ id: T; label: string }>,
  fallback: T,
  aliases: Record<string, T> = {}
) {
  const text = asString(value);
  if (!text) return fallback;
  const key = slug(text);
  const found = items.find((item) => item.id === text || slug(item.id) === key || slug(item.label) === key);
  return found?.id ?? aliases[key] ?? fallback;
}

function normalizeGenerationInput(body: GenerateRequestBody) {
  const rawSettings = isRecord(body.settings) ? body.settings : {};
  const hasSettingsObject = isRecord(body.settings);
  const prompt = (asString(body.prompt) || asString(body.userPrompt)).trim();
  const hasDesignSetting = hasSettingsObject || !!asString(body.designType) || !!asString(body.selectedDesignType);

  const directWidth = asNumber(body.width) ?? asNumber(body.canvasWidth);
  const directHeight = asNumber(body.height) ?? asNumber(body.canvasHeight);
  const hasDirectSize = directWidth !== undefined && directHeight !== undefined;

  const settings: StudioSettings = {
    ...DEFAULT_SETTINGS,
    ...(rawSettings as Partial<StudioSettings>),
    designType: choiceFrom(
      (rawSettings as Partial<StudioSettings>).designType ?? body.designType ?? body.selectedDesignType,
      DESIGN_TYPES,
      DEFAULT_SETTINGS.designType,
      {
        "youtube-thumbnail": "youtube",
        "instagram-reel-cover": "reel",
        "instagram-reel-thumbnail-cover": "reel",
        "reel-thumbnail-cover": "reel",
        "flex-banner": "flex",
        "flexi-banner": "flex",
        "flex-flex-banner": "flex",
        "awareness-flyer": "pamphlet",
        "pamphlet-awareness-flyer": "pamphlet"
      }
    ),
    language: choiceFrom(
      (rawSettings as Partial<StudioSettings>).language ?? body.language ?? body.selectedLanguage,
      LANGUAGES,
      DEFAULT_SETTINGS.language
    ),
    template: choiceFrom(
      (rawSettings as Partial<StudioSettings>).template ?? body.templateStyle ?? body.selectedTemplate,
      TEMPLATE_STYLES,
      DEFAULT_SETTINGS.template
    )
  };

  if (hasDirectSize) {
    settings.sizePreset = "custom";
    settings.customWidth = Math.max(1, Math.round(directWidth));
    settings.customHeight = Math.max(1, Math.round(directHeight));
    settings.customUnit = "px";
  }

  return {
    prompt,
    settings,
    missingDesignSettings: !hasDesignSetting,
    assetCount: asNumber(body.assetCount) ?? 0,
    referenceImages: Array.isArray(body.referenceImages) ? body.referenceImages : []
  };
}

function safeErrorReason(error: unknown) {
  const message = error instanceof Error && error.message ? error.message : OPENAI_GENERATION_FAILED_STATUS;
  return message.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 500);
}

export async function POST(request: Request) {
  try {
    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      rawBody = {};
    }

    const body = (isRecord(rawBody) ? rawBody : {}) as GenerateRequestBody;
    const receivedKeys = requestBodyKeys(rawBody);
    console.log("Request body keys:", receivedKeys);

    const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
    const requestedProvider = process.env.AI_IMAGE_PROVIDER || "openai";
    const apiKey = process.env.OPENAI_API_KEY;
    const envKeyFound = Boolean(process.env.OPENAI_API_KEY);
    const provider = envKeyFound ? "openai" : requestedProvider;
    console.log("OPENAI_API_KEY exists:", Boolean(process.env.OPENAI_API_KEY));
    console.log("OPENAI_IMAGE_MODEL:", process.env.OPENAI_IMAGE_MODEL);

    const normalized = normalizeGenerationInput(body);

    if (!normalized.prompt) {
      return NextResponse.json(
        {
          error: "Missing prompt",
          receivedKeys,
          envKeyFound,
          provider,
          fallback: false,
          statusMessage: "Missing prompt",
          errorReason: "Prompt was empty or not provided.",
          imageModel
        },
        { status: 400 }
      );
    }

    if (normalized.missingDesignSettings) {
      return NextResponse.json({
        error: "Missing design settings",
        receivedKeys,
        envKeyFound,
        provider,
        fallback: false,
        statusMessage: "Missing design settings",
        errorReason: "Provide settings, designType, or selectedDesignType.",
        imageModel
      });
    }

    const settings: StudioSettings = isWideFormatDesign(normalized.settings)
      ? {
          ...normalized.settings,
          sizePreset: "flex-228x78",
          template: normalized.settings.template === "flex-public-campaign" ? "flex-public-campaign" : "wide-backdrop",
          exportResolution: "print"
        }
      : normalized.settings;
    const sizeInfo = getSizeInfo(settings);
    const wideFormatMode = isWideFormatDesign(settings);
    const imageSize = getOpenAIImageSize(settings, sizeInfo, imageModel);
    const improvedPrompt = buildProfessionalDesignPrompt({
      prompt: normalized.prompt,
      settings,
      sizeInfo,
      assetCount: normalized.assetCount
    });
    const referenceSummary = normalized.referenceImages
      .map((asset) => `${asset.role}: ${asset.name}`)
      .join(", ");
    const variations = buildCampaignVariations(normalized.prompt, settings);

    if (!envKeyFound || !apiKey) {
      return NextResponse.json({
        provider: "local",
        imageProvider: provider,
        statusMessage: LOCAL_FALLBACK_STATUS,
        errorReason: "OPENAI_API_KEY was not found in the server environment.",
        imageModel,
        envKeyFound,
        fallback: true,
        generationMode: "local-fallback",
        wideFormatMode,
        improvedPrompt,
        metadata: {
          designType: settings.designType,
          templateStyle: settings.template,
          size: sizeInfo,
          language: settings.language,
          imageModel,
          imageSize,
          referenceImages: normalized.referenceImages,
          cpSirProtected: settings.protectCpSir,
          envKeyFound
        },
        variations: variations.map((variation) => ({
          ...variation,
          generationMode: "local-fallback",
          metadata: {
            designType: settings.designType,
            templateStyle: variation.template,
            size: {
              width: sizeInfo.width,
              height: sizeInfo.height,
              outputWidth: sizeInfo.outputWidth,
              outputHeight: sizeInfo.outputHeight,
              aspectRatio: sizeInfo.aspectRatio,
              dpi: sizeInfo.dpi
            },
            language: settings.language,
            wideFormatMode,
            fallback: true,
            envKeyFound
          }
        }))
      });
    }

    try {
      const openai = new OpenAI({ apiKey });
      const generatedVariations = await Promise.all(
        variations.map(async (variation, index) => {
          const imagePrompt = [
            makeVariationPrompt({
              userPrompt: normalized.prompt,
              variation,
              index,
              settings,
              sizeInfo,
              wideFormat: wideFormatMode
            }),
            referenceSummary
              ? `Uploaded reference image metadata only, for placement planning; do not recreate images, faces, logos, seals, QR codes, or readable marks: ${referenceSummary}.`
              : ""
          ]
            .filter(Boolean)
            .join("\n");
          const dataUrl = await generateOpenAIImage({
            client: openai,
            model: imageModel,
            prompt: imagePrompt,
            size: imageSize
          });

          return {
            ...variation,
            generationMode: "openai" as const,
            aiImage: {
              dataUrl,
              prompt: imagePrompt,
              size: imageSize,
              model: imageModel,
              provider: "openai" as const
            },
            metadata: {
              designType: settings.designType,
              templateStyle: variation.template,
              size: {
                width: sizeInfo.width,
                height: sizeInfo.height,
                outputWidth: sizeInfo.outputWidth,
                outputHeight: sizeInfo.outputHeight,
                aspectRatio: sizeInfo.aspectRatio,
                dpi: sizeInfo.dpi
              },
              language: settings.language,
              wideFormatMode,
              fallback: false,
              envKeyFound
            }
          };
        })
      );

      return NextResponse.json({
        provider: "openai",
        imageProvider: "openai",
        statusMessage: "Using OpenAI image generation",
        errorReason: null,
        imageModel,
        envKeyFound,
        fallback: false,
        generationMode: "openai",
        wideFormatMode,
        improvedPrompt,
        metadata: {
          designType: settings.designType,
          templateStyle: settings.template,
          size: sizeInfo,
          language: settings.language,
          imageModel,
          imageSize,
          referenceImages: normalized.referenceImages,
          cpSirProtected: settings.protectCpSir,
          envKeyFound
        },
        variations: generatedVariations
      });
    } catch (openAIError) {
      const errorReason = safeErrorReason(openAIError);
      return NextResponse.json({
        provider: "local",
        imageProvider: "openai",
        statusMessage: OPENAI_GENERATION_FAILED_STATUS,
        error: OPENAI_GENERATION_FAILED_STATUS,
        errorReason,
        imageModel,
        envKeyFound,
        fallback: true,
        generationMode: "local-fallback",
        wideFormatMode,
        improvedPrompt,
        metadata: {
          designType: settings.designType,
          templateStyle: settings.template,
          size: sizeInfo,
          language: settings.language,
          imageModel,
          imageSize,
          referenceImages: normalized.referenceImages,
          cpSirProtected: settings.protectCpSir,
          envKeyFound
        },
        variations: variations.map((variation) => ({
          ...variation,
          generationMode: "local-fallback",
          metadata: {
            designType: settings.designType,
            templateStyle: variation.template,
            size: {
              width: sizeInfo.width,
              height: sizeInfo.height,
              outputWidth: sizeInfo.outputWidth,
              outputHeight: sizeInfo.outputHeight,
              aspectRatio: sizeInfo.aspectRatio,
              dpi: sizeInfo.dpi
            },
            language: settings.language,
            wideFormatMode,
            fallback: true,
            envKeyFound
          }
        }))
      });
    }
  } catch (error) {
    const envKeyFound = Boolean(process.env.OPENAI_API_KEY);
    const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
    const provider = envKeyFound ? "openai" : process.env.AI_IMAGE_PROVIDER || "openai";
    return NextResponse.json(
      {
        error: FRIENDLY_AI_ERROR,
        statusMessage: OPENAI_GENERATION_FAILED_STATUS,
        errorReason: safeErrorReason(error),
        imageModel,
        envKeyFound,
        provider,
        fallback: false,
        generationMode: "openai"
      },
      { status: 502 }
    );
  }
}
