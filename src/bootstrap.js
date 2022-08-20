"use strict";

const fs = require("fs-extra");
const path = require("path");
const mime = require("mime-types");
const set = require("lodash.set");
const {
  categories,
  authors,
  articles,
  global,
  page,
  footer,
  navigation,
  contact,
  projectGroups,
  projects,
  boxGroups,
  boxes,
  referenceSlides,
  partner,
} = require("../data/data.json");

async function isFirstRun() {
  const pluginStore = strapi.store({
    environment: strapi.config.environment,
    type: "type",
    name: "setup",
  });
  const initHasRun = await pluginStore.get({ key: "initHasRun" });
  await pluginStore.set({ key: "initHasRun", value: true });
  return !initHasRun;
}

async function setPublicPermissions(newPermissions) {
  // Find the ID of the public role
  const publicRole = await strapi.query("plugin::users-permissions.role").findOne({
    where: {
      type: "public",
    },
  });

  // Create the new permissions and link them to the public role
  const allPermissionsToCreate = [];
  Object.keys(newPermissions).map((controller) => {
    const actions = newPermissions[controller];
    const permissionsToCreate = actions.map((action) => {
      return strapi.query("plugin::users-permissions.permission").create({
        data: {
          action: `api::${controller}.${controller}.${action}`,
          role: publicRole.id,
        },
      });
    });
    allPermissionsToCreate.push(...permissionsToCreate);
  });
  await Promise.all(allPermissionsToCreate);
}

function getFileSizeInBytes(filePath) {
  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats["size"];
  return fileSizeInBytes;
}

function getFileData(fileName) {
  const filePath = path.join("data", "uploads", fileName);
  // Parse the file metadata
  const size = getFileSizeInBytes(filePath);
  const ext = fileName.split(".").pop();
  const mimeType = mime.lookup(ext);

  return {
    path: filePath,
    name: fileName,
    size,
    type: mimeType,
  };
}

async function uploadFile(file, name) {
  return strapi
    .plugin("upload")
    .service("upload")
    .upload({
      files: file,
      data: {
        fileInfo: {
          alternativeText: `An image uploaded to Strapi called ${name}`,
          caption: name,
          name,
        },
      },
    });
}

// Create an entry and attach files if there are any
async function createEntry({ model, entry }) {
  try {
    // Actually create the entry in Strapi
    await strapi.entityService.create(`api::${model}.${model}`, {
      data: entry,
    });
  } catch (error) {
    console.error({ model, entry, error });
  }
}

async function checkFileExistsBeforeUpload(files) {
  const existingFiles = [];
  const uploadedFiles = [];
  const filesCopy = [...files];

  for (const fileName of filesCopy) {
    // Check if the file already exists in Strapi
    const fileWhereName = await strapi.query("plugin::upload.file").findOne({
      where: {
        name: fileName,
      },
    });

    if (fileWhereName) {
      // File exists, don't upload it
      existingFiles.push(fileWhereName);
    } else {
      // File doesn't exist, upload it
      const fileData = getFileData(fileName);
      const fileNameNoExtension = fileName.split(".").shift();
      const [file] = await uploadFile(fileData, fileNameNoExtension);
      uploadedFiles.push(file);
    }
  }
  const allFiles = [...existingFiles, ...uploadedFiles];
  // If only one file then return only that file
  return allFiles.length === 1 ? allFiles[0] : allFiles;
}

async function updateBlocks(blocks) {
  const updatedBlocks = [];
  for (const block of blocks) {
    if (block.__component === "shared.media") {
      const uploadedFiles = await checkFileExistsBeforeUpload([block.file]);
      // Copy the block to not mutate directly
      const blockCopy = { ...block };
      // Replace the file name on the block with the actual file
      blockCopy.file = uploadedFiles;
      updatedBlocks.push(blockCopy);
    } else if (block.__component === "shared.slider") {
      // Get files already uploaded to Strapi or upload new files
      const existingAndUploadedFiles = await checkFileExistsBeforeUpload(block.files);
      // Copy the block to not mutate directly
      const blockCopy = { ...block };
      // Replace the file names on the block with the actual files
      blockCopy.files = existingAndUploadedFiles;
      // Push the updated block
      updatedBlocks.push(blockCopy);
    } else {
      // Just push the block as is
      updatedBlocks.push(block);
    }
  }

  return updatedBlocks;
}

async function updateImageBlocks(blocks) {
  const updatedBlocks = [];
  for (const block of blocks) {
    let background = null;
    let logo = null;
    if (block.background !== null) {
      background = await checkFileExistsBeforeUpload([block.background]);
    }
    if (block.logo !== null) {
      logo = await checkFileExistsBeforeUpload([block.logo]);
    }
    // Copy the block to not mutate directly
    const blockCopy = { ...block };
    // Replace the file name on the block with the actual file
    blockCopy.background = background;
    blockCopy.logo = logo;
    updatedBlocks.push(blockCopy);
  }
  return updatedBlocks;
}

async function updateSlides(blocks) {
  const updatedBlocks = [];
  for (const block of blocks) {
    let image = null;
    let logo = null;
    if (block.image !== null) {
      image = await checkFileExistsBeforeUpload([block.image]);
    }
    if (block.logo !== null) {
      logo = await checkFileExistsBeforeUpload([block.logo]);
    }
    // Copy the block to not mutate directly
    const blockCopy = { ...block };
    // Replace the file name on the block with the actual file
    blockCopy.image = image;
    blockCopy.logo = logo;
    updatedBlocks.push(blockCopy);
  }
  return updatedBlocks;
}

async function importArticles() {
  for (const article of articles) {
    const cover = await checkFileExistsBeforeUpload([`${article.slug}.jpg`]);
    const updatedBlocks = await updateBlocks(article.blocks);

    await createEntry({
      model: "article",
      entry: {
        ...article,
        cover,
        blocks: updatedBlocks,
        // Make sure it's not a draft
        publishedAt: Date.now(),
      },
    });
  }
}

async function importReferenceSlides() {
  const updatedImageBlocks = await updateImageBlocks(referenceSlides.imageBlocks);

  await createEntry({
    model: "reference-slider",
    entry: {
      ...referenceSlides,
      imageBlocks: updatedImageBlocks,
      // Make sure it's not a draft
      publishedAt: Date.now(),
    },
  });
}

async function importNavigation() {
  const logo = await checkFileExistsBeforeUpload([navigation.logo]);

  await createEntry({
    model: "navigation",
    entry: {
      ...navigation,
      logo,
      // Make sure it's not a draft
      publishedAt: Date.now(),
    },
  });
}

async function importPartner() {
  const updatedSlides = await updateSlides(partner.slides);

  return createEntry({
    model: "partner",
    entry: {
      ...partner,
      slides: updatedSlides,
      // Make sure it's not a draft
      publishedAt: Date.now(),
    },
  });
}

async function importGlobal() {
  const favicon = await checkFileExistsBeforeUpload(["favicon.png"]);
  const shareImage = await checkFileExistsBeforeUpload(["default-image.jpg"]);

  const video = global.video;
  const source = await checkFileExistsBeforeUpload([video.videoSource]);
  const videoCopy = { ...video };
  videoCopy.videoSource = source;

  return createEntry({
    model: "global",
    entry: {
      ...global,
      favicon,
      // Make sure it's not a draft
      publishedAt: Date.now(),
      defaultSeo: {
        ...global.defaultSeo,
        shareImage,
      },
      video: videoCopy,
    },
  });
}

async function importFooter() {
  const logo = await checkFileExistsBeforeUpload([footer.logo]);

  return createEntry({
    model: "footer",
    entry: {
      ...footer,
      logo,
      publishedAt: Date.now(),
    },
  });
}

async function importContact() {
  return createEntry({
    model: "contact",
    entry: {
      ...contact,
      publishedAt: Date.now(),
    },
  });
}

async function importPage() {
  const updatedBlocks = await updateBlocks(page.blocks);
   const coverImage = await checkFileExistsBeforeUpload(["about-image.jpg"]);

  await createEntry({
    model: "page",
    entry: {
      ...page,
      coverImage,
      blocks: updatedBlocks,
      // Make sure it's not a draft
      publishedAt: Date.now(),
    },
  });
}

async function importCategories() {
  for (const category of categories) {
    await createEntry({ model: "category", entry: category });
  }
}

async function importAuthors() {
  for (const author of authors) {
    const avatar = await checkFileExistsBeforeUpload([author.avatar]);

    await createEntry({
      model: "author",
      entry: {
        ...author,
        avatar,
      },
    });
  }
}

async function importAuthors() {
  for (const author of authors) {
    const avatar = await checkFileExistsBeforeUpload([author.avatar]);

    await createEntry({
      model: "author",
      entry: {
        ...author,
        avatar,
      },
    });
  }
}

async function importProjects() {
  for (const project of projects) {
    const topLeftImage = await checkFileExistsBeforeUpload([project.topLeftImage]);
    const topRightImage = await checkFileExistsBeforeUpload([project.topRightImage]);

    let logo = null;
    if (project.logo !== null) {
      logo = await checkFileExistsBeforeUpload([project.logo]);
    }
    const sideTopImage = await checkFileExistsBeforeUpload([project.sideTopImage]);
    const sideBottomImage = await checkFileExistsBeforeUpload([project.sideBottomImage]);

    await createEntry({
      model: "project",
      entry: {
        ...project,
        topLeftImage,
        topRightImage,
        logo,
        sideTopImage,
        sideBottomImage,
      },
    });
  }
}

async function importProjectGroups() {
  for (const projectGroup of projectGroups) {
    let background = null;

    if (projectGroup.background !== null) {
      background = await checkFileExistsBeforeUpload([projectGroup.background]);
    }

    await createEntry({
      model: "project-group",
      entry: {
        ...projectGroup,
        background,
      },
    });
  }
}

async function importBoxGroups() {
  for (const boxGroup of boxGroups) {
    let background = null;

    if (boxGroup.background !== null) {
      background = await checkFileExistsBeforeUpload([boxGroup.background]);
    }
    await createEntry({
      model: "box-group",
      entry: {
        ...boxGroup,
        background,
      },
    });
  }
}

async function importBoxes() {
  for (const box of boxes) {
    let background = null;
    let logo = null;
    if (box.background !== null) {
      background = await checkFileExistsBeforeUpload([box.background]);
    }
    if (box.logo !== null) {
      logo = await checkFileExistsBeforeUpload([box.logo]);
    }

    await createEntry({
      model: "box",
      entry: {
        ...box,
        background,
        logo,
      },
    });
  }
}

async function importSeedData() {
  // Allow read of application content types
  await setPublicPermissions({
    article: ["find", "findOne"],
    category: ["find", "findOne"],
    author: ["find", "findOne"],
    global: ["find", "findOne"],
    page: ["find", "findOne"],
  });

  // Create all entries
  await importCategories();
  await importAuthors();
  await importArticles();
  await importGlobal();
  await importPage();
  await importFooter();
  await importProjectGroups();
  await importProjects();
  await importBoxGroups();
  await importBoxes();
  await importNavigation();
  await importContact();
  await importReferenceSlides();
  await importPartner();
}

module.exports = async () => {
  const shouldImportSeedData = await isFirstRun();

  if (shouldImportSeedData) {
    try {
      console.log("Setting up the template...");
      await importSeedData();
      console.log("Ready to go");
    } catch (error) {
      console.log("Could not import seed data");
      console.error(error);
    }
  }
};
