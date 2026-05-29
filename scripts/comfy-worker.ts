import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import Jimp from "jimp";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMFY_API_URL = process.env.COMFY_API_URL || "http://127.0.0.1:8188";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  console.error("Please ensure these variables are set in your .env file.");
  process.exit(1);
}

// Initialize Supabase Client with service role key to bypass RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

console.log("=========================================");
console.log("   BLOXSMITH COMFYUI LOCAL QUEUE WORKER  ");
console.log("=========================================");
console.log(`Supabase Endpoint: ${SUPABASE_URL}`);
console.log(`ComfyUI Server:    ${COMFY_API_URL}`);
console.log("=========================================");

// Roblox template URLs
const SHIRT_TEMPLATE_URL = "http://static.rbxcdn.com/images/Template-Shirt.png";
const PANTS_TEMPLATE_URL = "http://static.rbxcdn.com/images/Template-Pants.png";

// Helper to customize ComfyUI workflow JSON
function customizeWorkflow(
  workflowTemplate: any,
  params: {
    prompt: string;
    negativePrompt?: string;
    seed: number;
    steps: number;
    cfg: number;
    width: number;
    height: number;
  }
) {
  // If user has custom token replacements in their JSON
  const seedVal = params.seed === -1 ? Math.floor(Math.random() * 10000000000) : params.seed;

  let str = JSON.stringify(workflowTemplate);
  str = str
    .replace(/"{PROMPT}"/g, JSON.stringify(params.prompt))
    .replace(/"{NEGATIVE_PROMPT}"/g, JSON.stringify(params.negativePrompt || ""))
    .replace(/"{SEED}"/g, String(seedVal))
    .replace(/"{STEPS}"/g, String(params.steps))
    .replace(/"{CFG}"/g, String(params.cfg))
    .replace(/"{WIDTH}"/g, String(params.width))
    .replace(/"{HEIGHT}"/g, String(params.height));

  const workflow = JSON.parse(str);

  // Fallback: search and replace typical clip text encoder & sampler fields if tokens not used
  const traverse = (node: any) => {
    if (!node || typeof node !== "object") return;
    for (const key in node) {
      if (node[key] && typeof node[key] === "object") {
        traverse(node[key]);
      } else if (key === "text" && typeof node[key] === "string" && node[key] === "prompt") {
        node[key] = params.prompt;
      } else if (key === "text" && typeof node[key] === "string" && node[key] === "negative") {
        node[key] = params.negativePrompt || "";
      } else if (key === "seed" && typeof node[key] === "number" && node[key] === 0) {
        node[key] = seedVal;
      } else if (key === "steps" && typeof node[key] === "number" && node[key] === 4) {
        node[key] = params.steps;
      } else if (key === "cfg" && typeof node[key] === "number" && node[key] === 1) {
        node[key] = params.cfg;
      } else if (key === "width" && typeof node[key] === "number" && node[key] === 1024) {
        node[key] = params.width;
      } else if (key === "height" && typeof node[key] === "number" && node[key] === 1024) {
        node[key] = params.height;
      }
    }
  };

  traverse(workflow);
  return workflow;
}

// Built-in standard SDXL-Lightning workflow as fallback
const DEFAULT_SDXL_LIGHTNING_WORKFLOW = {
  "3": {
    "inputs": {
      "seed": "{SEED}",
      "steps": "{STEPS}",
      "cfg": "{CFG}",
      "sampler_name": "dpmpp_sde",
      "scheduler": "sgm_uniform",
      "denoise": 1,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    },
    "class_type": "KSampler"
  },
  "4": {
    "inputs": {
      "ckpt_name": "sdxl_lightning_4step.safetensors"
    },
    "class_type": "CheckpointLoaderSimple"
  },
  "5": {
    "inputs": {
      "width": "{WIDTH}",
      "height": "{HEIGHT}",
      "batch_size": 1
    },
    "class_type": "EmptyLatentImage"
  },
  "6": {
    "inputs": {
      "text": "{PROMPT}",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode"
  },
  "7": {
    "inputs": {
      "text": "{NEGATIVE_PROMPT}",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode"
  },
  "8": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["4", 2]
    },
    "class_type": "VAEDecode"
  },
  "9": {
    "inputs": {
      "filename_prefix": "BloxsmithComfy",
      "images": ["8", 0]
    },
    "class_type": "SaveImage"
  }
};

// Apply Roblox template mapping to create flat 585x559 wraps
async function applyRobloxTemplateMapping(inputImage: Jimp, kind: string): Promise<Buffer> {
  const isShirt = kind === "classic_shirt";
  const templateUrl = isShirt ? SHIRT_TEMPLATE_URL : PANTS_TEMPLATE_URL;

  console.log(`[Worker] Downloading Roblox ${kind} template grid...`);
  const templateGrid = await Jimp.read(templateUrl);
  
  // Create output canvas filled with background color of generated art
  const output = new Jimp(585, 559, 0x00000000);

  // Extract average/background color of the generated image to fill seams
  let r = 0, g = 0, b = 0, count = 0;
  // Sample edges
  for (let x = 0; x < inputImage.bitmap.width; x += 50) {
    const color = Jimp.intToRGBA(inputImage.getPixelColor(x, 10));
    r += color.r; g += color.g; b += color.b; count++;
  }
  const bgHex = Jimp.rgbaToInt(Math.round(r / count), Math.round(g / count), Math.round(b / count), 255);
  
  // Fill base canvas with background color
  const baseFill = new Jimp(585, 559, bgHex);

  // Helper to crop & paste onto panels
  const copyPanel = (srcX: number, srcY: number, w: number, h: number, destX: number, destY: number) => {
    const cropped = inputImage.clone().crop(srcX, srcY, w, h).resize(w, h);
    baseFill.composite(cropped, destX, destY);
  };

  const iw = inputImage.bitmap.width;
  const ih = inputImage.bitmap.height;

  if (isShirt) {
    // Torso Front (128x128) - center crop
    copyPanel(Math.floor(iw / 2 - 64), Math.floor(ih / 2 - 64), 128, 128, 64, 64);
    // Torso Back (128x128)
    copyPanel(Math.floor(iw / 2 - 64), Math.floor(ih / 2 - 64), 128, 128, 256, 64);
    // Torso Left/Right (64x128)
    copyPanel(10, Math.floor(ih / 2 - 64), 64, 128, 0, 64); // Right side
    copyPanel(iw - 74, Math.floor(ih / 2 - 64), 64, 128, 192, 64); // Left side
    // Torso Top/Bottom (128x64)
    copyPanel(Math.floor(iw / 2 - 64), 10, 128, 64, 128, 0); // Top
    copyPanel(Math.floor(iw / 2 - 64), ih - 74, 128, 64, 256, 0); // Bottom

    // Arms Right (320, 64) & Left (320, 320)
    const armWidth = 64;
    const armHeight = 128;
    const armTop = 64;

    // Right Arm Front (384, 64), Left (448, 64), Right (320, 64), Back (512, 64)
    copyPanel(50, 100, armWidth, armHeight, 320, 64);
    copyPanel(50, 100, armWidth, armHeight, 384, 64);
    copyPanel(50, 100, armWidth, armHeight, 448, 64);
    copyPanel(50, 100, armWidth, armHeight, 512, 64);
    copyPanel(50, 50, armWidth, armTop, 320, 0); // Top
    copyPanel(50, ih - 100, armWidth, armTop, 384, 0); // Bottom

    // Left Arm Front (384, 320), Left (448, 320), Right (320, 320), Back (512, 320)
    copyPanel(iw - 114, 100, armWidth, armHeight, 320, 320);
    copyPanel(iw - 114, 100, armWidth, armHeight, 384, 320);
    copyPanel(iw - 114, 100, armWidth, armHeight, 448, 320);
    copyPanel(iw - 114, 100, armWidth, armHeight, 512, 320);
    copyPanel(iw - 114, 50, armWidth, armTop, 320, 256); // Top
    copyPanel(iw - 114, ih - 100, armWidth, armTop, 384, 256); // Bottom
  } else {
    // Pants mapping (Right Leg & Left Leg panels)
    const legWidth = 64;
    const legHeight = 128;
    const legTop = 64;

    // Right Leg panels (X: 320..512, Y: 64)
    copyPanel(50, 100, legWidth, legHeight, 320, 64);
    copyPanel(50, 100, legWidth, legHeight, 384, 64);
    copyPanel(50, 100, legWidth, legHeight, 448, 64);
    copyPanel(50, 100, legWidth, legHeight, 512, 64);
    copyPanel(50, 50, legWidth, legTop, 320, 0);
    copyPanel(50, ih - 100, legWidth, legTop, 384, 0);

    // Left Leg panels (X: 320..512, Y: 320)
    copyPanel(iw - 114, 100, legWidth, legHeight, 320, 320);
    copyPanel(iw - 114, 100, legWidth, legHeight, 384, 320);
    copyPanel(iw - 114, 100, legWidth, legHeight, 448, 320);
    copyPanel(iw - 114, 100, legWidth, legHeight, 512, 320);
    copyPanel(iw - 114, 50, legWidth, legTop, 320, 256);
    copyPanel(iw - 114, ih - 100, legWidth, legTop, 384, 256);

    // Torso Front/Back (for high-waist pants/belts)
    copyPanel(Math.floor(iw / 2 - 64), Math.floor(ih / 2 - 64), 128, 128, 64, 64);
    copyPanel(Math.floor(iw / 2 - 64), Math.floor(ih / 2 - 64), 128, 128, 256, 64);
    copyPanel(10, Math.floor(ih / 2 - 64), 64, 128, 0, 64);
    copyPanel(iw - 74, Math.floor(ih / 2 - 64), 64, 128, 192, 64);
    copyPanel(Math.floor(iw / 2 - 64), 10, 128, 64, 128, 0);
    copyPanel(Math.floor(iw / 2 - 64), ih - 74, 128, 64, 256, 0);
  }

  // Composite the official Roblox guidelines/layout template lines over the color layer
  baseFill.composite(templateGrid, 0, 0);
  return await baseFill.getBufferAsync(Jimp.MIME_PNG);
}

// Watch & process jobs loop
async function pollQueue() {
  try {
    // 1. Fetch next pending job
    const { data: job, error: fetchErr } = await supabase
      .from("comfy_generation_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      console.error("[Worker] Error fetching jobs from queue:", fetchErr);
      return;
    }

    if (!job) {
      // No pending jobs
      return;
    }

    console.log(`[Worker] Found job ${job.id} (${job.type}) submitted by ${job.user_id}`);

    // 2. Set status to generating
    const { error: updateErr } = await supabase
      .from("comfy_generation_jobs")
      .update({ status: "generating" })
      .eq("id", job.id);

    if (updateErr) {
      console.error(`[Worker] Error marking job ${job.id} as generating:`, updateErr);
      return;
    }

    try {
      // 3. Prepare workflow JSON
      let workflowJson: any = DEFAULT_SDXL_LIGHTNING_WORKFLOW;
      
      const customWorkflowPath = path.join(process.cwd(), "workflow.json");
      if (fs.existsSync(customWorkflowPath)) {
        try {
          console.log("[Worker] Using custom workflow.json found in workspace.");
          const raw = fs.readFileSync(customWorkflowPath, "utf-8");
          workflowJson = JSON.parse(raw);
        } catch (e) {
          console.error("[Worker] Failed to parse custom workflow.json, falling back to default:", e);
        }
      }

      const customized = customizeWorkflow(workflowJson, {
        prompt: job.prompt,
        negativePrompt: job.negative_prompt || "",
        seed: Number(job.seed ?? -1),
        steps: Number(job.steps ?? 4),
        cfg: Number(job.cfg ?? 1.0),
        width: Number(job.width ?? 1024),
        height: Number(job.height ?? 1024),
      });

      console.log("[Worker] Submitting request to ComfyUI...");
      const submitRes = await fetch(`${COMFY_API_URL}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: customized }),
      });

      if (!submitRes.ok) {
        throw new Error(`ComfyUI returned HTTP ${submitRes.status}: ${await submitRes.text()}`);
      }

      const { prompt_id: promptId } = await submitRes.json();
      console.log(`[Worker] ComfyUI job created: prompt_id = ${promptId}`);

      // 4. Poll ComfyUI history for completion
      let completed = false;
      let checkCount = 0;
      let outputImageUrl = "";
      let rawImageBuffer: Buffer | null = null;
      let imageMime = "image/png";

      while (!completed && checkCount < 120) { // 2 minutes timeout
        await new Promise((r) => setTimeout(r, 1500));
        checkCount++;

        const historyRes = await fetch(`${COMFY_API_URL}/history/${promptId}`);
        if (!historyRes.ok) continue;

        const history = await historyRes.json();
        const runInfo = history[promptId];

        if (runInfo && runInfo.outputs) {
          completed = true;
          console.log("[Worker] ComfyUI generation complete. Retrieving image...");

          // Find first image output
          for (const nodeId in runInfo.outputs) {
            const outputs = runInfo.outputs[nodeId];
            if (outputs.images && outputs.images.length > 0) {
              const file = outputs.images[0];
              const viewUrl = `${COMFY_API_URL}/view?filename=${encodeURIComponent(
                file.filename
              )}&subfolder=${encodeURIComponent(file.subfolder || "")}&type=${encodeURIComponent(
                file.type || ""
              )}`;

              const imgDataRes = await fetch(viewUrl);
              if (imgDataRes.ok) {
                rawImageBuffer = Buffer.from(await imgDataRes.arrayBuffer());
                imageMime = imgDataRes.headers.get("content-type") || "image/png";
                break;
              }
            }
          }
        }
      }

      if (!rawImageBuffer) {
        throw new Error("ComfyUI finished but no image could be downloaded.");
      }

      // 5. Apply Roblox Template Mapping if classic clothing
      let finalBuffer = rawImageBuffer;
      const isClassicClothing = job.type === "classic_shirt" || job.type === "classic_pants";

      if (isClassicClothing) {
        console.log(`[Worker] Packaging generated art into a Roblox template wrap...`);
        const inputImg = await Jimp.read(rawImageBuffer);
        finalBuffer = await applyRobloxTemplateMapping(inputImg, job.type);
        imageMime = "image/png"; // templates must be PNG
      }

      // 6. Upload to Supabase Storage in "generated-images" bucket
      const folder = job.user_id;
      const ext = imageMime.includes("jpeg") ? "jpg" : "png";
      const filename = `${folder}/${job.id}-${Date.now()}.${ext}`;

      console.log(`[Worker] Uploading final image to Supabase Storage: generated-images/${filename}`);
      const { error: uploadErr } = await supabase.storage
        .from("generated-images")
        .upload(filename, finalBuffer, {
          contentType: imageMime,
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`Failed to upload generated image: ${uploadErr.message}`);
      }

      const { data: pub } = supabase.storage
        .from("generated-images")
        .getPublicUrl(filename);
      
      outputImageUrl = pub.publicUrl;
      console.log(`[Worker] Image public URL: ${outputImageUrl}`);

      // 7. Update Job Status to completed
      await supabase
        .from("comfy_generation_jobs")
        .update({
          status: "completed",
          output_image_url: outputImageUrl,
        })
        .eq("id", job.id);

      console.log(`[Worker] Job ${job.id} marked as completed!`);
    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`[Worker] Job failed: ${errMsg}`);
      
      // Update status to failed. Database trigger will refund credits automatically.
      await supabase
        .from("comfy_generation_jobs")
        .update({
          status: "failed",
          error_message: errMsg,
        })
        .eq("id", job.id);
    }
  } catch (error) {
    console.error("[Worker] Loop exception:", error);
  }
}

// Start polling loop
async function run() {
  console.log("[Worker] Polling for jobs every 2 seconds...");
  while (true) {
    await pollQueue();
    await new Promise((r) => setTimeout(r, 2000));
  }
}

run().catch((e) => {
  console.error("[Worker] Fatal error:", e);
  process.exit(1);
});
