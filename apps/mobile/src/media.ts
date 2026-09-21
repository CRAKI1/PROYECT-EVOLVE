import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

function safeExtension(fileName: string | null | undefined, uri: string, mimeType: string | null | undefined) {
  const candidate = (fileName ?? uri).split("?")[0]?.split(".").pop()?.toLowerCase();
  if (candidate && /^[a-z0-9]{2,5}$/.test(candidate)) return candidate;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic" || mimeType === "image/heif") return "heic";
  return "jpg";
}

export async function pickAndStorePlanImage(weekday: number): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: 0.85,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;

  const directory = new Directory(Paths.document, "plan-media");
  directory.create({ idempotent: true, intermediates: true });

  const extension = safeExtension(asset.fileName, asset.uri, asset.mimeType);
  const destination = new File(directory, `weekday-${weekday}-${Date.now()}.${extension}`);
  const source = new File(asset.uri);
  await source.copy(destination);

  return destination.uri;
}

export function removeStoredPlanImage(uri: string | null | undefined) {
  if (!uri || !uri.includes("/plan-media/")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cleanup is best-effort; the plan record remains authoritative.
  }
}


async function storeNutritionAsset(asset: ImagePicker.ImagePickerAsset) {
  const directory = new Directory(Paths.document, "nutrition-media");
  directory.create({ idempotent: true, intermediates: true });
  const extension = safeExtension(asset.fileName, asset.uri, asset.mimeType);
  const destination = new File(directory, `meal-${Date.now()}.${extension}`);
  const source = new File(asset.uri);
  await source.copy(destination);
  return destination.uri;
}

export async function pickAndStoreNutritionImage(
  source: "camera" | "library",
): Promise<string | null> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("La cámara no tiene permiso.");
  }

  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.82,
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.82,
      });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return storeNutritionAsset(asset);
}

export function removeStoredNutritionImage(uri: string | null | undefined) {
  if (!uri || !uri.includes("/nutrition-media/")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup. Database history remains authoritative.
  }
}
