(function(root){
  "use strict";
  // These are editable starting points, not instructions applied to every story.
  const common="以下のパロディ設定を舞台の基本とし、今回明示された条件・夢主設定・作品別の補足を優先してください。原作の口調・価値観・長所と欠点を残し、この環境ならどう振る舞うかを考えてください。関係性や年齢の指定を変えず、必要な立場だけ補い、設定は説明として列挙せず言動や生活の細部に反映してください。";
  const everyday="原作の超常能力や戦闘をそのまま持ち込まず、性格・習慣・得意分野・人間関係を現代の生活へ自然に翻案してください。";
  const otherworld="この舞台に合う制度・道具・移動・連絡手段を使ってください。シチュエーションの核を保ち、現代の設備が前提ならこの世界で成立する手段へ置き換えてください。";
  const entries=[
    {
      key:"modern",title:"現パロ（現代の日常）",worldMode:"modern",
      text:"現代日本に近い街で暮らす設定です。仕事や買い物、休日、通い慣れた店など、二人の日常が重なる場所を今回の場面に合わせて選んでください。スマートフォンや電車は必要なときだけ使い、職業・収入・住まい・同居の有無は指定以上に固定しないでください。",
      adaptation:everyday
    },
    {
      key:"campus",title:"学パロ（大学・専門学校）",worldMode:"school",
      text:"大学・専門学校などのキャンパスを舞台にします。成人設定を保ち、学生・院生・教職員などの立場は二人の年齢と指定された関係性に合わせてください。講義、実習、図書館、学食、サークルなどから場面に役立つものを選びます。全員を同級生にしたり、夢主を未指定の学部・部活・生徒会へ所属させたりしないでください。",
      adaptation:everyday
    },
    {
      key:"office",title:"オフィスパロ",worldMode:"modern",
      text:"現代の会社を舞台にします。先輩・後輩・同期、部署や業務上の立場を必要な範囲で整え、年次と敬語、私生活での距離感を混同しないでください。会議前後、休憩、共同作業、退勤などの生活感を使えます。学歴・採用区分・役職を不要に列挙せず、仕事の進め方や判断に人物像を滲ませてください。全員を有能なエリートや優しい上司にせず、雑さや短気さも場面に応じて残してください。",
      adaptation:everyday
    },
    {
      key:"cafe",title:"カフェパロ",worldMode:"modern",
      text:"現代のカフェ・喫茶店とその周辺を舞台にします。店主・店員・常連客などの立場は今回の関係性に合わせ、二人を自動的に同僚や店員と客の組み合わせへ固定しないでください。注文の覚え方、カップを置く手つき、仕込み、閉店後の静けさなどから人物ごとの気遣いや距離感を表現します。接客用の態度と親しい相手への素顔の違いも、原作の人物像に合う範囲で扱ってください。",
      adaptation:everyday
    },
    {
      key:"share-house",title:"シェアハウスパロ",worldMode:"modern",
      text:"個室と共用の台所・居間があるシェアハウスを舞台にします。どちらが住人か、訪問者かは指定された関係性とシチュエーションに合わせてください。生活時間のずれ、食器、共有スペース、帰宅時の気配などから普段の距離を描きます。同じ建物にいることを同室や交際の理由にせず、私室に入る際の了解や住人同士の生活上の境界を自然に扱ってください。",
      adaptation:everyday
    },
    {
      key:"entertainment",title:"芸能界パロ（俳優・アイドル）",worldMode:"modern",
      text:"現代の芸能活動の現場を舞台にします。俳優・アイドル・制作側など、キャラクターに合う仕事を必要な範囲で選び、夢主を自動的にファンやマネージャーへ固定しないでください。稽古、収録、楽屋、移動、出番の合間などを使い、公の顔と人目がないときの振る舞いの差を描きます。有名人であることを女慣れや過剰な甘い台詞に結びつけず、秘密の交際やスキャンダルも指定なく必須にしないでください。",
      adaptation:everyday
    },
    {
      key:"band",title:"バンドパロ",worldMode:"modern",
      text:"現代の音楽活動を舞台にします。バンドの練習、スタジオ、ライブハウス、機材の片付けなどから場面を選び、音の残響や演奏前後の集中の違いを使えます。担当楽器・活動規模・夢主の関わり方は必要な分だけ決め、全員をボーカルや人気者にしないでください。歌詞の引用や告白の歌を定番の結末にせず、原作の人物らしい取り組み方や仲間への態度から魅力を描いてください。",
      adaptation:everyday
    },
    {
      key:"royal-court",title:"王宮・貴族パロ",worldMode:"unrestricted",
      text:"架空の王国の宮廷・貴族社会を舞台にします。王族・貴族・宮廷で働く者などの立場は指定に合わせ、夢主を自動的に姫や婚約者にしないでください。公の礼儀と私的な呼び方、招待、舞踏会、庭園、身分による行動の制約などから必要なものを選びます。家柄や政治制度を細かく説明せず、政略結婚・身分差・魔法は指定がなければ必須にしないでください。",
      adaptation:otherworld
    },
    {
      key:"knight-adventure",title:"騎士・冒険者パロ",worldMode:"unrestricted",
      text:"架空の王国や街道、騎士団・冒険者ギルドのある世界を舞台にします。騎士・護衛・冒険者・依頼人などの役割は人物と関係性に合わせてください。任務の前後、装備の手入れ、宿、旅の休息など、危険の外側にある日常も使えます。夢主を一方的に守られる存在にせず、原作の能力は剣術・魔法・交渉などこの世界の技能へ必要な範囲で翻案し、全員を無敵にしないでください。",
      adaptation:otherworld
    },
    {
      key:"magic-academy",title:"魔法学園パロ",worldMode:"unrestricted",
      text:"魔法を学び研究する架空の学園を舞台にします。成人設定の場合は高等教育・研究機関として扱い、学生・研究者・講師などの立場を年齢と関係性に合わせてください。実習、図書塔、薬草園、寮の共有スペースなどを使えます。魔法の得意不得意には人物像を反映し、夢主に特別な血統や希少能力を自動追加しないでください。恋愛感情を魔法で強制したり、不可抗力の接触だけで関係を進めたりしないでください。",
      adaptation:otherworld
    },
    {
      key:"ayakashi",title:"和風あやかしパロ",worldMode:"unrestricted",
      text:"人とあやかしの暮らしが隣り合う、架空の和風の町や里を舞台にします。神社、路地、灯り、祭り、季節の移ろいなどから必要な要素を選びます。誰が人間・あやかしなのかは指定を優先し、場面に必要な分だけ補ってください。原作の気質を種族のテンプレートに置き換えず、夢主を巫女や生贄、相手の所有物へ自動的に設定しないでください。契約や寿命差を扱う場合も、関係性の指定を尊重してください。",
      adaptation:otherworld
    },
    {
      key:"taisho-romance",title:"大正浪漫風パロ",worldMode:"unrestricted",
      text:"和洋の生活様式が混ざる、近代日本を思わせる架空の街を舞台にします。洋館、喫茶店、書店、手紙、路面電車などから場面に必要なものを選びます。厳密な史実再現ではなく雰囲気を基本とし、実在の制度や慣習を未確認のまま断定しないでください。原作の口調を一律に古風な言葉へ変えず、夢主にも芝居がかった女性語を増やさないでください。スマートフォンなど現代の設備は持ち込まないでください。",
      adaptation:otherworld
    },
    {
      key:"near-future",title:"近未来SFパロ",worldMode:"unrestricted",
      text:"現在より少し技術が進んだ架空の都市や宇宙拠点を舞台にします。端末、移動設備、仕事道具などは少数の分かりやすい仕組みに絞り、専門用語や世界設定の説明を主役にしないでください。技術によって変わる生活と変わらない人物の癖を描きます。原作の技能はこの世界の仕事や技術へ翻案でき、夢主や相手を指定なく人工生命・軍人・特別な実験体にしないでください。",
      adaptation:otherworld
    },
    {
      key:"reincarnation",title:"転生現パロ",worldMode:"modern",
      text:"原作での生を前世とし、現代に生まれ直した世界を舞台にします。前世の記憶の有無、どちらが相手に気づいているか、現世の付き合いは今回の指定を優先し、足りない部分だけ自然に補ってください。見覚えのある仕草、無意識の習慣、名前の響きなどで過去の気配を表せます。夢主との前世の恋愛や悲劇的な死を自動的に作らず、記憶がある場合も回想や説明を重ねず現在の二人の選択を描いてください。",
      adaptation:everyday
    }
  ].map(({key,title,worldMode,text,adaptation})=>({
    id:`builtin-stage-${key}`,revision:1,title,kind:"stage",body:[common,text,adaptation].join("\n\n"),
    enabled:true,activation:"manual",protagonistMode:"append",worldMode,
    scope:{works:[],series:[],characterIds:[],worldModes:[],stageIds:[]},
    reference:{name:"",version:"",excerpt:""}
  }));
  function addMissing(settings){
    const result=JSON.parse(JSON.stringify(settings)),ids=new Set(result.entries.map(e=>e.id));
    // Identity, not title, preserves renamed, edited and disabled user copies.
    result.entries.push(...JSON.parse(JSON.stringify(entries.filter(e=>!ids.has(e.id)))));
    return result;
  }
  root.DreamGachaStagePresets={entries,addMissing};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.DreamGachaStagePresets;
})(typeof globalThis!=="undefined"?globalThis:this);
