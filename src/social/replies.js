// What the family bots say back to quick chat, typed chat and emotes, in each family member's voice.
// Dorian = the dad (Tycoon), Esther = the mom (Guardian), Mati = the girl (Speedster),
// Micah = the boy (Sneaky Thief). {name} = the person they're answering. Keep every line kid-safe.

export const REPLIES = {
  hi: {
    dorian: ['Hey there, {name}!', 'Well hello, {name}!', 'Howdy, partner!'],
    esther: ['Hi sweetie!', 'Hello, {name}!', 'Hi {name}! Sunscreen on?'],
    maddie: ['Hiiii {name}!', 'Hey! Wanna race?', 'Hi hi hi!'],
    micah: ['Oh, hi {name}... hehe.', 'Yo {name}!', "Hi! I'm not up to anything."],
  },
  bye: {
    dorian: ['See ya later, alligator!', 'Bye, champ!'],
    esther: ['Bye sweetie! Be good!', 'Bye {name}! Drink some water!'],
    maddie: ['Byeee!', 'Bye {name}! Zoom zoom!'],
    micah: ['Bye! Can I have your plants?', 'Later, {name}!'],
  },
  gg: {
    dorian: ['Good game, champ!', "GG! Dad's proud of you."],
    esther: ['Good game, sweetie!', 'GG! So proud of you!'],
    maddie: ['GG! Rematch?', 'Good game! I was SO close!'],
    micah: ['GG! ...I let you win.', "Good game! Next time I'm stealing everything."],
  },
  thanks: {
    dorian: ['Anytime, kiddo!', "You're welcome!"],
    esther: ["You're welcome, sweetie!", "Aww, you're so polite!"],
    maddie: ['No problem!', "You're welcome!"],
    micah: ['Hehe, no problem!', 'You owe me one.'],
  },
  nice: {
    dorian: ["Thanks! Dad's still got it.", 'Why thank you!'],
    esther: ['Aww, thank you!', 'Teamwork!'],
    maddie: ['I know, right?!', 'Thanks!'],
    micah: ['Heh, thanks!', "I'm kind of a pro."],
  },
  wow: {
    dorian: ['Impressive, right?', 'Wow indeed!'],
    esther: ['I know! So pretty!', 'Wow is right!'],
    maddie: ['WOW WOW WOW!', 'So cool!'],
    micah: ['Whoa!', 'Right?!'],
  },
  yes: {
    dorian: ["That's the spirit!"],
    esther: ['Good!'],
    maddie: ['Yay!'],
    micah: ['Woo!'],
  },
  no: {
    dorian: ['Suit yourself!'],
    esther: ['Okay, sweetie!'],
    maddie: ['Aww, okay!'],
    micah: ['Your loss! Hehe.'],
  },
  mine: {
    dorian: ["Relax, I'm just looking... for now.", 'Nice garden. Be a shame if...'],
    esther: ['Keep it locked, sweetie!', 'Guard it well!'],
    maddie: ['Not for long! Hehe!', 'Catch me first!'],
    micah: ['Is it though? Hehe.', 'For now...'],
  },
  nicesteal: {
    dorian: ['Business is business!', 'Why thank you!'],
    esther: ['Mom always wins!', 'Thank you, sweetie!'],
    maddie: ['Too fast, right?!', 'Zoom! Thanks!'],
    micah: ['Sneaky sneaky!', "Thanks! I'm a ninja."],
  },
  race: {
    dorian: ["You're on, champ!", "Dad's got this!"],
    esther: ["Oh, it's on!", 'Ready, set... go!'],
    maddie: ["You're ON!", "I'm the fastest! Let's go!"],
    micah: ['Race you to Starbloom!', 'Last one there is a rotten seed!'],
  },
  // trading (social/botTrade.js): "Trade?" from too far away gets 'trade'; the rest answer invites and offers.
  // {thing} = one of the bot's plants or pets it proposes
  trade: {
    dorian: ['Come on over and we can trade, champ!', 'Walk over here and we can make a deal!'],
    esther: ['Come here, sweetie, and we can trade!', 'Come closer and we can swap, {name}!'],
    maddie: ['Race over here and we can trade!', 'Come here! Trade time!'],
    micah: ['Come closer... if you dare. Hehe.', 'Over here, {name}. Let us talk.'],
  },
  tradeYes: {
    dorian: ["Let's make a deal, champ!", 'Deal! Pleasure doing business.', "You've got a deal, {name}!"],
    esther: ["Of course, sweetie! Let's trade.", 'Sounds lovely, {name}!', 'Deal, sweetie!'],
    maddie: ['Ooh, yes! Trade time!', 'Deal! Pinky promise!', 'Yes yes yes!'],
    micah: ['Fine, deal. Hehe.', 'Okay okay, you got me. Deal!'],
  },
  tradeNo: {
    dorian: ['Not right now, champ!', 'Maybe later, kiddo!'],
    esther: ['Not now, sweetie. Maybe later!', "Sorry sweetie, I'm busy!"],
    maddie: ['No way! Mine are the best!', "Not now, I'm racing!"],
    micah: ["Trade? I'd rather STEAL. Hehe.", 'Nope! Sneaky Micah never trades.'],
  },
  tradeUnfair: {
    dorian: ['Sweeten the deal a little, champ!', "Add a bit more and it's a deal!"],
    esther: ['Almost, sweetie! Just a tiny bit more?', 'So close! A little more?'],
    maddie: ["Add a little more and I'll say yes!", 'Hmm, not enough! More please!'],
    micah: ['Make it way better and we have a deal. Hehe.', 'Ha! I want MORE than that.'],
  },
  tradeOffer: {
    dorian: ['How about my {thing}, champ?', 'I can give you my {thing}!'],
    esther: ['You can have my {thing}, sweetie!', 'How about my {thing}?'],
    maddie: ['Ooh! I can give you my {thing}!', 'Want my {thing}?'],
    micah: ['Fine, you can have my {thing}. Hehe.', 'My {thing}? Okay...'],
  },
  tradeCash: {
    dorian: ['How about some cash for it, champ?'],
    esther: ['I can pay you for it, sweetie!'],
    maddie: ['I can give you some coins!'],
    micah: ['I can pay you. A little. Hehe.'],
  },
  tradeGift: {
    dorian: ['A present? Thanks, champ!'],
    esther: ['Aww, for me? Thank you, sweetie!'],
    maddie: ['For me?! Yay, thank you!'],
    micah: ['Free stuff? Hehe, thanks!'],
  },
  tradeDone: {
    dorian: ['Pleasure doing business, champ!', 'Great trade!'],
    esther: ['Enjoy, sweetie!', 'What a lovely trade!'],
    maddie: ['Yay! Best trade ever!', 'Woohoo! Trade done!'],
    micah: ['Hehe, I win this one.', 'Nice doing business. Hehe.'],
  },
  tradeBye: {
    dorian: ['Back to work for me. Bye, champ!', "Let's trade another time!"],
    esther: ["Let's trade later, sweetie!", 'Maybe another time, sweetie!'],
    maddie: ['Too slow! Gotta zoom!', 'Bye! Trade later!'],
    micah: ["Boring! I'm out. Hehe.", 'Later, {name}!'],
  },
  help: {
    dorian: ["Bonk 'em, champ!", 'You can do it!'],
    esther: ['Lock your garden, sweetie!', 'Chase them and bonk!'],
    maddie: ['Run, run, run!', 'Go go go!'],
    micah: ['Hehe, good luck!', 'Not it!'],
  },
  oops: {
    dorian: ['Happens to the best of us!', 'Shake it off, champ!'],
    esther: ["It's okay, sweetie!", 'Oopsie daisy!'],
    maddie: ['Oopsie!', 'Hahaha!'],
    micah: ['Hahaha!', 'Smooth move!'],
  },
  watch: {
    dorian: ['Where?!', 'Thanks for the heads up!'],
    esther: ['Thanks for the warning!', 'Eyes open, everyone!'],
    maddie: ['Eek!', 'Where? WHERE?'],
    micah: ['I see nothing!', "Wasn't me!"],
  },
  catch: {
    dorian: ["Oh, I'm coming for you!", 'Here comes Dad!'],
    esther: ["You can't run forever!", 'Get back here, you!'],
    maddie: ["Too easy! I'm the fastest!", 'Challenge accepted!'],
    micah: ['Challenge accepted!', 'Ninja mode ON!'],
  },
};

// Emote reactions that come with a line (said now and then, not every time).
export const EMOTE_LINES = {
  wave: REPLIES.hi,
  cheer: {
    dorian: ['Yeah!', "That's my champ!"],
    esther: ['Woohoo!', 'Yay, go {name}!'],
    maddie: ['Yay!!', 'WOOO!'],
    micah: ["Let's gooo!", 'Yeah!'],
  },
  laugh: {
    dorian: ['Ha! Good one.', 'Hahaha!'],
    esther: ['Hehe, you silly!', 'Hahaha!'],
    maddie: ['Hahaha!', 'LOL!'],
    micah: ['Hehehe!', 'Hahaha!'],
  },
  point: {
    dorian: ['Who, me?', "What'd I do?"],
    esther: ['What is it, sweetie?', 'Me?'],
    maddie: ['What? What?!', 'Me?!'],
    micah: ["It wasn't me!", 'Who, me? Hehe.'],
  },
  dance: {
    dorian: ['Dad moves!', 'Check out these moves!'],
    esther: ['Ooh, I love this song!', 'Dance party!'],
    maddie: ['Floss time!', 'Dance party!'],
    micah: ['Watch this!', 'Dance off!'],
  },
  sit: {
    dorian: ['Break time? Good idea.', 'Picnic!'],
    esther: ['Taking a little rest?', 'Good idea, sweetie.'],
    maddie: ['Sit? No time! Zoom!', 'Break time!'],
    micah: ['Snack break!', 'Is it snack time?'],
  },
  // someone keeps spamming the same thing
  spam: {
    dorian: ['Okay okay, I heard you!'],
    esther: ['Yes sweetie, I heard you!'],
    maddie: ['OKAY I HEARD YOU!'],
    micah: ['Hehe, broken record!'],
  },
};

/** Each family member's favourite dance (the avatar animations: dance1 Dance, dance2 Robot, dance3 Floss). */
export const SIGNATURE_DANCE = { dorian: 'dance2', esther: 'dance1', maddie: 'dance3', micah: 'dance1' };

// Typed chat (social/chat.js): what a typed line is about, by keywords. First match wins; the bots answer
// with that table (TYPED_REPLIES below, or the quick-chat table of the same name in REPLIES). Matched on
// the line in lower case with accents dropped.
export const TYPED_INTENTS = [
  { id: 'hi', re: /\b(hi+|hey+|hel+o+|hiya|howdy|yo|sup|good (morning|afternoon|evening))\b/ },
  { id: 'bye', re: /\b(bye+|goodbye|see (ya|you)|gtg|g2g|got to go|gotta go|good ?night)\b/ },
  { id: 'gg', re: /\b(gg+|good game|well played|wp)\b/ },
  { id: 'thanks', re: /\b(thanks?|thank (you|u)|thx|ty)\b/ },
  { id: 'sorry', re: /\b(sorry|my bad|soz)\b/ },
  { id: 'joke', re: /\b(jokes?|riddle)\b/ },
  { id: 'funny', re: /\b(lo+l+|(ha){2,}h?|(he){2,}h?|lmao|funny|hilarious)\b|😂|🤣/u },
  { id: 'love', re: /\b(love|luv|ily)\b|❤|💕|💖|😍|🥰/u },
  { id: 'howto', re: /\b(how (do|can|to)|what do i|stuck|tips?)\b/ },
  { id: 'help', re: /\b(help+|save me)\b/ },
  { id: 'steal', re: /\b(steal|steals|stealing|stole|stolen|thief|thieves|rob|robbed|robbing|robber)\b/ },
  { id: 'race', re: /\b(race|racing|fastest|faster)\b/ },
  { id: 'trade', re: /\b(trade|trading|swap)\b/ },
  { id: 'pet', re: /\b(pets?|eggs?|puppy|kitty|dragon|unicorn)\b/ },
  { id: 'best', re: /\b(i win|i won|winning|the best|number one)\b/ },
  { id: 'nice', re: /\b(nice|cool|awesome|great|amazing|good job|well done)\b/ },
  { id: 'wow', re: /\b(wo+w+|whoa+|omg)\b/ },
];

// Replies to typed lines that quick chat has no phrase for. 'huh' = someone called a bot by name about
// nothing it understood. Same rules as above: short, kid-safe, in each family member's voice.
export const TYPED_REPLIES = {
  sorry: {
    dorian: ['No worries, champ!', 'All good, {name}!'],
    esther: ["It's okay, sweetie!", 'Apology accepted!'],
    maddie: ["It's fine! Let's play!", 'No biggie!'],
    micah: ['Hehe, okay!', 'I forgive you... for now.'],
  },
  joke: {
    dorian: ['Why did the seed go to school? To grow up!', 'What do you call a sad strawberry? A blueberry!', 'Plant jokes always grow on people!'],
    esther: ['What did the big flower say to the little one? Hi, bud!', 'Why are gardeners good at math? Square roots!'],
    maddie: ['What has ears but cannot hear? Corn! Hahaha!', 'Knock knock! Lettuce. Lettuce in, it is cold!'],
    micah: ['Why did the tomato turn red? It saw the salad dressing!', 'What do you call a sneaky seed? A sprout spy! Hehe.'],
  },
  funny: {
    dorian: ['Ha! Good one.', 'Hahaha! Dad approves.'],
    esther: ['Hehe, you silly!', 'You crack me up!'],
    maddie: ['LOL!', 'Hahaha! So funny!'],
    micah: ['Hehehe!', 'LOL! Good one!'],
  },
  love: {
    dorian: ['Love you too, champ!', 'Aww, you made my day!'],
    esther: ['Love you too, sweetie!', 'Aww! Big hugs!'],
    maddie: ['Aww! Love you too!', 'Yay! Hugs!'],
    micah: ['Aww... love you too. Hehe.', 'Hugs! But I am still stealing.'],
  },
  howto: {
    dorian: ['Grab seeds, plant them, collect the cash, champ!', 'Buy speed at the shop. Fast feet, big money!'],
    esther: ['Plant seeds in your garden and lock it, sweetie!', 'Bonk thieves before they get away!'],
    maddie: ['Run down the road and grab the shiny seeds!', 'Buy speed! Speed is everything!'],
    micah: ['Sneak into gardens and grab plants! Hehe.', 'Steal when nobody is looking. Shh!'],
  },
  steal: {
    dorian: ['Business is business, champ!', 'Lock your garden or I just might!'],
    esther: ['Keep your lock on, sweetie!', 'Chase them and bonk them!'],
    maddie: ['Catch me if you can!', "I'm too fast to catch!"],
    micah: ['Who, me? I never steal. Hehe.', 'Sneaky Micah strikes again!'],
  },
  pet: {
    dorian: ['Pets give great boosts, champ!', 'A good pet is a smart investment!'],
    esther: ['Aww, pets are the cutest!', 'Take good care of your pet, sweetie!'],
    maddie: ['I want ALL the pets!', 'Pets are so cute!'],
    micah: ['My pet helps me sneak. Hehe.', 'Pets are the best sidekicks!'],
  },
  best: {
    dorian: ["We'll see about that, champ!", 'The game is not over yet!'],
    esther: ["You're all winners to me!", 'So proud of you, sweetie!'],
    maddie: ['Nope, I am the best! Hehe!', 'Not if I catch up first!'],
    micah: ['Not for long! Hehe.', 'Enjoy it while it lasts!'],
  },
  huh: {
    dorian: ['Yes, {name}?', 'What is it, champ?'],
    esther: ['Yes, sweetie?', "I'm listening, {name}!"],
    maddie: ['What? What?!', 'Yeah, {name}?'],
    micah: ['Huh? Who, me?', 'What did I do?'],
  },
};

/** Words that call a family bot by name (their name, and what the kids call them). */
export const BOT_CALLS = {
  dorian: ['dorian', 'dad', 'daddy', 'papa'],
  esther: ['esther', 'mom', 'mommy', 'mum', 'mummy', 'mama'],
  maddie: ['mati', 'maddie'],
  micah: ['micah'],
};
