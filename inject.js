let api_key;
const API_URL = "https://api.inferkit.com/v1/models/standard/generate";
const ARTICLE_SELECTOR = ".article-body-commercial-selector";
const PARA_SELECTOR = `${ARTICLE_SELECTOR} > p`;
// This isn't always correct, see: https://www.theguardian.com/music/2022/may/15/florence-welch-machine-dance-fever-interview
const HEADLINE_SELECTOR = '[data-gu-name="headline"] h1';
// This isn't always correct, see: https://www.theguardian.com/commentisfree/2022/may/15/lets-not-mock-bald-men-but-do-they-really-feel-threatened
const STANDFAST_SELECTOR = '[data-gu-name="standfirst"] div p';
const AUTHOR_IMAGE_SELECTOR = '[data-gu-name="meta"] img';
const AUTHOR_NAME_SELECTOR = '[data-gu-name="meta"] a[rel="author"]';
const GENERATE_SOUND_URL =
  "https://assets.mixkit.co/sfx/preview/mixkit-typewriter-soft-hit-1366.mp3";
const COMPLETE_SOUND_URL =
  "https://previews.customer.envatousercontent.com/files/390069600/preview.mp3";
const BOT_IMAGE_URL =
  "http://s3.amazonaws.com/pix.iemoji.com/images/emoji/apple/ios-12/256/robot-face.png";
const POP_SOUND_URL =
  "https://audio-previews.elements.envatousercontent.com/files/105394911/preview.mp3";
const NEWLINE = "\n\n";

const PARAGRAPH_TYPE = "PARA";
const CONTENT_TYPE = "CONTENT";
const HEADLINE_TYPE = "HEADLINE";
const STANDFAST_TYPE = "STANDFAST";

const lengthMappings = {
  [PARAGRAPH_TYPE]: 250,
  [CONTENT_TYPE]: 500,
  [HEADLINE_TYPE]: 80,
  [STANDFAST_TYPE]: 150,
};

const paraClass = document.querySelectorAll(PARA_SELECTOR)[0].className;
const headlineNode = document.querySelectorAll(HEADLINE_SELECTOR)[0];
const standfastNode = document.querySelectorAll(STANDFAST_SELECTOR)[0];

const playSound = (url) => {
  const sound = new Audio(url);
  sound.volume = 0.1;
  sound.play();
};

const generate = async (prompt, type, startAt, startWith) => {
  const headers = {};
  let url = API_URL;

  if (api_key) {
    // API key provided - use it
    headers["Authorization"] = api_key;
  } else {
    // API key not provided - use demo credits
    url = url + "?useDemoCredits=true";
  }

  const payload = {
    length: lengthMappings[type],
    prompt: { text: prompt },
    streamResponse: true,
  };

  console.log("Generating with prompt");
  console.log(prompt);

  await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
    .then((response) =>
      processChunkedResponse(response, type, startAt, startWith)
    )
    .then((text) => text)
    .catch(console.error);
};

const processChunkedResponse = (response, type, startAt, startWith) => {
  // TODO: generalise this to not just paras
  let node = startAt || addParagraph();

  let text = startWith || "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  return readChunk();

  function readChunk() {
    return reader.read().then(appendChunks);
  }

  function appendChunks(result) {
    let chunk = JSON.parse(
      decoder.decode(result.value || new Uint8Array(), {
        stream: !result.done,
      })
    );

    text += chunk.data.text;

    playSound(GENERATE_SOUND_URL);

    if (text.includes(NEWLINE)) {
      playSound(COMPLETE_SOUND_URL);

      // TODO: will this work if there's more than one newline?
      let textLines = text.split(NEWLINE);
      node.textContent = textLines[0];

      if ([HEADLINE_TYPE, STANDFAST_TYPE].includes(type)) {
        // Disgard the remainder of the string and exit
        return text;
      } else {
        // Create new node
        text = textLines[1];
        node = addParagraph(node);
      }
    }

    node.textContent = text;

    if (chunk.data.isFinalChunk) {
      return text;
    } else {
      return readChunk();
    }
  }
};

const addParagraph = (after) => {
  const para = document.createElement("p");
  para.classList.add(paraClass);

  if (after) {
    after.after(para);
  } else {
    document.querySelectorAll(ARTICLE_SELECTOR)[0].appendChild(para);
  }

  return para;
};

//   TODO: sometimes this doesn't work - depends on ad loading state
// Simplify this. fade out the whole thing then resize and delete all children (not separately)
const removeAllParagraphs = async () => {
  const paras = document.querySelectorAll(ARTICLE_SELECTOR)[0].childNodes;

  while (paras.length > 0) {
    await new Promise((r) => setTimeout(r, 20));
    paras[0].remove();
  }
};

const updateAuthor = () => {
  try {
    document.querySelectorAll(AUTHOR_NAME_SELECTOR)[0].textContent =
      "JOURNOBOT v0.0.1";
    // TODO: this is sometimes broken, for example: https://www.theguardian.com/food/2022/mar/23/how-to-make-gnocchi-recipe-felicity-cloake
    document.querySelectorAll(AUTHOR_IMAGE_SELECTOR)[0].src = BOT_IMAGE_URL;
  } catch (error) {
    console.log(error);
  }
};

const makeContentPrompt = () => {
  const headline = headlineNode.innerText;
  const standfast = standfastNode.innerText;

  return `Headline: ${headline}

Subheadline: ${standfast}

Article:
  
`;
};

const firstThreeWords = (sentence) => sentence.split(" ").slice(0, 3).join(" ");

const makeHeadlinePrompt = () => {
  const headline = headlineNode.innerText;
  return `Headline: ${firstThreeWords(headline)}`;
};

const makeStandfastPrompt = () => {
  const headline = headlineNode.innerText;
  return `Headline: ${headline}

Subheadline: `;
};

const rewriteArticle = async () => {
  const headlinePrompt = makeHeadlinePrompt();

  await generate(
    headlinePrompt,
    HEADLINE_TYPE,
    headlineNode,
    firstThreeWords(headlineNode.innerText)
  );

  const standfastPrompt = makeStandfastPrompt();

  await generate(standfastPrompt, STANDFAST_TYPE, standfastNode);

  const prompt = makeContentPrompt();

  await removeAllParagraphs();

  await generate(prompt, CONTENT_TYPE);

  updateParagraphClickListeners();

  updateAuthor();
};

const getPreviousParagraph = (para) => {
  let sibling = para.previousElementSibling;

  while (sibling) {
    if (sibling.matches("p")) return sibling;
    sibling = sibling.previousElementSibling;
  }
};

const makePromptFromPara = (para) => {
  const previous = getPreviousParagraph(para);
  if (previous) {
    const previousPrevious = getPreviousParagraph(previous);
    if (previousPrevious) {
      return `${previousPrevious.textContent}
      
${previous.textContent}
      
`;
    } else {
      return `${makeContentPrompt()}${previous.textContent}

`;
    }
  } else {
    return makeContentPrompt();
  }
};

const rewriteParagraph = async (para) => {
  playSound(POP_SOUND_URL);

  const prompt = makePromptFromPara(para);

  await generate(prompt, PARAGRAPH_TYPE, para);

  updateParagraphClickListeners();
};

const updateParagraphClickListeners = () => {
  const paras = document.querySelectorAll(PARA_SELECTOR);

  paras.forEach((para) =>
    para.addEventListener("click", (event) => {
      const node = event.target;
      rewriteParagraph(node);
    })
  );
};

const injectStyles = () => {
  const style = document.createElement("style");

  style.innerHTML = `${PARA_SELECTOR}:hover {
		background-color: lightgray;
    cursor: pointer;
  }
	
	.squash {
		max-height:0 !important;
		transition:max-height 1s ease-in;
    overflow: hidden;
	}
  
  #journobot-menu {
    position: fixed;
    bottom: 0px;
    right: 0px;
    padding: 30px;
    margin: 20px;
    background-color: lightgray;
    z-index: 100;
    border-radius: 10px;
    font-family: monospace;
  }

  #journobot-menu .title {
    font-weight: bold;
    font-size: 20px;
    margin-bottom: 10px;
  }

  #journobot-menu .rewrite-button {
    text-decoration: underline;
    color: darkred;
    cursor: pointer;
  }
  `;

  document.body.appendChild(style);
};

const fetchApiKey = async () => {
  const response = await fetch(chrome.runtime.getURL("secrets.json")).catch(
    (err) => {
      console.log("Failed to fetch secrets");
    }
  );

  if (!response) return;

  const json = await response.json().catch((err) => {
    console.log("Failed to parse secrets JSON");
  });

  if (!json) return;

  return json.inferkit_api_key;
};

const init = async () => {
  api_key = await fetchApiKey();

  const menu = document.createElement("div");
  menu.id = "journobot-menu";
  const title = document.createElement("div");
  title.classList.add("title");
  const rewriteButton = document.createElement("div");
  rewriteButton.classList.add("rewrite-button");

  title.appendChild(document.createTextNode("JOURNOBOT v0.0.1 🤖"));
  rewriteButton.appendChild(document.createTextNode("rewrite article"));
  menu.appendChild(title);
  menu.appendChild(rewriteButton);

  document.body.appendChild(menu);

  rewriteButton.addEventListener("click", (event) => {
    rewriteArticle();
  });

  updateParagraphClickListeners();

  injectStyles();
};

init();
