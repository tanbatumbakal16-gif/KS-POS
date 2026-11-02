const sharp = require("sharp");

async function createIcons() {
  await sharp("public/icon.svg")
    .resize(192, 192)
    .png()
    .toFile("public/icon-192.png");

  await sharp("public/icon.svg")
    .resize(512, 512)
    .png()
    .toFile("public/icon-512.png");

  console.log("KS POS icons created successfully!");
}

createIcons().catch(console.error);