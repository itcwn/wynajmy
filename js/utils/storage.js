const DEFAULT_BUCKET = 'RentalObjectsImages';

function ensureSupabaseClient(supabase) {
  if (!supabase || typeof supabase !== 'object' || !supabase.storage?.from) {
    throw new Error('Brak poprawnej konfiguracji Supabase do przesyłania plików.');
  }
  return supabase;
}

function createRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeExtension(filename = '') {
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(filename.trim());
  if (!match) {
    return '';
  }
  return `.${match[1].toLowerCase()}`;
}

function buildStoragePath({
  prefix,
  file,
  index,
}) {
  const safePrefix = prefix?.replace(/[^a-zA-Z0-9/_-]/g, '-') || 'uploads';
  const extension = sanitizeExtension(file?.name);
  const uniqueSegment = createRandomId();
  const ordinal = Number.isFinite(index) ? String(index).padStart(2, '0') : '00';
  return `${safePrefix}/${ordinal}-${uniqueSegment}${extension}`;
}

function toArray(files) {
  if (!files) {
    return [];
  }
  if (Array.isArray(files)) {
    return files;
  }
  if (typeof FileList !== 'undefined' && files instanceof FileList) {
    return Array.from(files);
  }
  return Array.from(files);
}

export async function uploadFacilityImages({
  supabase,
  files,
  bucket = DEFAULT_BUCKET,
  prefix,
  maxFileSize = 8 * 1024 * 1024,
} = {}) {
  const client = ensureSupabaseClient(supabase);
  const selectedFiles = toArray(files).filter((file) => file && file.size);
  if (!selectedFiles.length) {
    return [];
  }

  const rejected = selectedFiles.find((file) => file.size > maxFileSize);
  if (rejected) {
    throw new Error(`Plik "${rejected.name}" jest za duży. Maksymalny rozmiar to ${(maxFileSize / (1024 * 1024)).toFixed(0)} MB.`);
  }

  const storageBucket = client.storage.from(bucket);
  const publicUrls = [];

  for (const [index, file] of selectedFiles.entries()) {
    const path = buildStoragePath({ prefix, file, index });
    const { data, error } = await storageBucket.upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    });
    if (error) {
      throw new Error(error.message || 'Nie udało się przesłać pliku.');
    }
    const storedPath = data?.path || path;
    const { data: publicData } = storageBucket.getPublicUrl(storedPath);
    if (!publicData?.publicUrl) {
      throw new Error('Nie udało się pobrać publicznego adresu zdjęcia.');
    }
    publicUrls.push(publicData.publicUrl);
  }

  return publicUrls;
}

export const STORAGE_BUCKET_FACILITY_IMAGES = DEFAULT_BUCKET;

export default uploadFacilityImages;
