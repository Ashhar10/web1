const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const FRAMES_DIR = path.resolve(__dirname, '../public/assets/frames');
const BACKUP_DIR = path.resolve(__dirname, '../public/assets/frames_png_backup');

async function convertAll() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const files = fs.readdirSync(FRAMES_DIR).filter(f => f.toLowerCase().endsWith('.png'));
  console.log(`Found ${files.length} PNG frames to convert...`);

  let originalTotalSize = 0;
  let newTotalSize = 0;
  let convertedCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const srcPath = path.join(FRAMES_DIR, file);
    const destName = file.replace(/\.png$/i, '.webp');
    const destPath = path.join(FRAMES_DIR, destName);
    const backupPath = path.join(BACKUP_DIR, file);

    const stat = fs.statSync(srcPath);
    originalTotalSize += stat.size;

    // Convert to high-quality WebP
    await sharp(srcPath)
      .webp({ quality: 82, effort: 5 })
      .toFile(destPath);

    const newStat = fs.statSync(destPath);
    newTotalSize += newStat.size;

    // Move original PNG to backup directory
    fs.renameSync(srcPath, backupPath);

    convertedCount++;
    if (convertedCount % 25 === 0 || convertedCount === files.length) {
      console.log(`Converted ${convertedCount}/${files.length} frames...`);
    }
  }

  const origMB = (originalTotalSize / (1024 * 1024)).toFixed(2);
  const newMB = (newTotalSize / (1024 * 1024)).toFixed(2);
  const savedPercent = (((originalTotalSize - newTotalSize) / originalTotalSize) * 100).toFixed(1);

  console.log(`\n🎉 Conversion complete!`);
  console.log(`Original total size: ${origMB} MB`);
  console.log(`New WebP total size: ${newMB} MB`);
  console.log(`Saved: ${(origMB - newMB).toFixed(2)} MB (${savedPercent}% reduction)`);
  console.log(`Original PNGs safely moved to: ${BACKUP_DIR}`);
}

convertAll().catch(err => {
  console.error('Conversion failed:', err);
  process.exit(1);
});
