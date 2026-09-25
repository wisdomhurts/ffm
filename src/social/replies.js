// What the family bots say back to quick chat and emotes, in each family member's voice.
// Dorian = the dad (Tycoon), Esther = the mom (Guardian), Maddie = the girl (Speedster),
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
  trade: {
    dorian: ["Ha! My plants aren't for sale!", 'Trade with a friend online, champ!'],
    esther: ["Sorry sweetie, I'm keeping mine!", 'Find a friend online to trade with!'],
    maddie: ['No way! Mine are the best!', 'Trade with a friend online!'],
    micah: ["Trade? I'd rather STEAL. Hehe.", 'Nope! Sneaky Micah never trades.'],
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
