/**
 * 이야기 뼈대(비트) 카드 — "짜임새 있는 동화"를 만드는 장치.
 *
 * 왜 필요한가. 지금까지는 프롬프트에 "감정을 터뜨리고 → 바닥을 지나 → 스스로 깨닫게 하라"고
 * **말로** 일러 줬다. 모델은 추상적인 지시보다 **장면별로 못 박은 뼈대**를 훨씬 잘 따라간다.
 * 그래서 좋은 그림책들이 실제로 쓰는 이야기 골격을 카드로 정리해 두고, 만들 때 한 장 골라
 * "1장면은 이것, 2장면은 이것"으로 배분해 준다.
 *
 * 원작을 베끼지 않는다. 문장이나 소재가 아니라 **구조만** 가져온다 — 삼세번의 리듬,
 * 떠났다 돌아오기, 누적 반복 같은 것들은 특정 작품의 것이 아니라 옛이야기부터 내려온
 * 공용 골격이다. 살(대사·소재·인물)은 전부 부모가 넣은 재료에서 나온다.
 *
 * 카드를 여러 장 두고 돌려 쓰는 이유도 있다. 한 집에서 여러 편을 만들면 구조가 겹쳐
 * "또 같은 이야기네"가 되는데, 카드가 다르면 같은 재료로도 다른 결의 책이 나온다.
 */

/** 만들기 화면의 이야기 갈래. (anthropic.ts의 StoryMaterial.kind와 같은 값) */
export type StoryKind = "today" | "imagine" | "emotion" | "direct";

export type Beat = {
  /** 장면의 짧은 이름 — 프롬프트에 그대로 나가고, 뼈대를 읽기 쉽게 한다. */
  label: string;
  /** 이 장면에서 무슨 일이 일어나야 하는지. 모델이 읽고 장면을 짓는다. */
  guide: string;
  /**
   * 쪽을 나눌 때의 무게. 클수록 쪽을 더 받는다.
   * 이야기의 산(위기·절정)에 쪽을 더 줘야 밋밋하지 않다.
   */
  weight?: number;
  /**
   * 쪽수가 적어도 반드시 살아남아야 하는 뼈대.
   * 3쪽짜리에서도 '사건'과 '해결'은 빠지면 이야기가 아니게 된다.
   */
  essential?: boolean;
};

export type BeatTemplate = {
  id: string;
  /** 뼈대 이름 — 로그·디버그용. 본문에는 절대 안 나간다. */
  label: string;
  /** 어울리는 갈래. 여러 갈래에 쓸 수 있는 뼈대도 있다. */
  kinds: StoryKind[];
  /** 이 뼈대의 성격 한 줄. 프롬프트 맨 위에 붙어 전체 결을 잡아 준다. */
  note: string;
  /** 이 뼈대가 제 모양을 내려면 최소 몇 쪽이 필요한가. */
  minPages: number;
  /**
   * 이 골격이 잘 맞는 나이 [최소, 최대]. 9는 '8세 이상'을 담는 값(prefs.ts AGE_OVER).
   *
   * 나이는 글자수만 정하는 게 아니라 **어떤 구조를 따라올 수 있는지**를 가른다.
   * 두 살은 이야기를 따라가지 못하고 반복되는 리듬에 반응하고, 다섯 살은 '왜'를 묻고,
   * 일곱 살은 반전을 즐긴다. 조망수용(상대의 마음 헤아리기)이 필요한 골격을 세 살에게
   * 주면 이야기가 붕 뜨고, 반대로 여덟 살에게 단순 반복을 주면 시시해진다.
   */
  ages: [number, number];
  /**
   * 이 골격을 어디서 가져왔는지. 프롬프트에는 나가지 않고 기록으로만 남긴다.
   * 나중에 "이 카드가 왜 이런 모양인가"를 되짚고, 실제 책과 대조해 다듬기 위해서다.
   */
  source?: string;
  beats: Beat[];
};

/**
 * 뼈대 카드 목록.
 *
 * 감정동화(emotion)를 가장 두껍게 깔았다 — 감정을 다루는 이야기는 굴곡이 없으면
 * 그냥 훈계가 되어 버려서, 구조의 도움이 가장 크게 필요한 갈래다.
 */
export const BEAT_TEMPLATES: BeatTemplate[] = [
  /* ── 감정 동화 ─────────────────────────────────────────────── */
  {
    id: "feel-and-settle",
    label: "터뜨리고 가라앉기",
    kinds: ["emotion"],
    note: "마음을 충분히 터뜨린 뒤 가장 힘든 바닥을 지나고, 아이 스스로 가라앉히는 방법을 찾아낸다.",
    minPages: 4,
    ages: [4, 9],
    beats: [
      { label: "평온한 시작", guide: "아이가 좋아하는 일을 하며 기분 좋게 있는 장면. 곧 흔들릴 평온을 먼저 보여 준다." },
      { label: "마음이 흔들림", guide: "그 감정이 생기는 일이 벌어진다. 마음이 움직이는 걸 몸의 느낌으로 보여 준다(가슴이 콩닥, 얼굴이 뜨끈).", essential: true },
      { label: "터뜨림", guide: "감정을 행동으로 한 번 크게 터뜨린다(발을 쿵쿵, 확 밀침, 엉엉 욺). 참게 하지 않는다.", weight: 1.3, essential: true },
      { label: "바닥", guide: "가장 힘든 자리를 지난다. 혼자 남거나 상황이 더 엉망이 된다. 여기서 바로 해결로 넘어가지 않는다.", weight: 1.3, essential: true },
      { label: "스스로 찾은 방법", guide: "아이가 스스로 마음을 가라앉힐 방법을 떠올려 해 본다. 어른이 알려 주지 않는다.", weight: 1.2, essential: true },
      { label: "가라앉음", guide: "마음이 가라앉고, 아이가 이번에 알게 된 것이 아이 입에서 한 문장으로 나온다.", essential: true },
    ],
  },
  {
    id: "body-signal",
    label: "몸이 먼저 말해요",
    kinds: ["emotion"],
    note: "감정을 몸의 감각으로 따라간다 — 어린아이가 '내 마음'을 알아차리는 법을 배우는 결.",
    minPages: 3,
    ages: [2, 6],
    beats: [
      { label: "몸의 신호", guide: "무언가 일이 생기고, 아이 몸에 먼저 신호가 온다(배가 간질, 주먹이 꽉, 눈이 뜨끈).", essential: true },
      { label: "점점 커짐", guide: "그 느낌이 점점 커져 참기 어려워진다. 소리·움직임으로 커지는 걸 보여 준다.", weight: 1.2, essential: true },
      { label: "넘침", guide: "결국 넘쳐서 밖으로 터진다. 그리고 잠시 멍해진다.", weight: 1.2 },
      { label: "달래 보기", guide: "아이가 몸을 달래는 방법을 하나 해 본다(물 마시기, 크게 숨 쉬기, 달리기 — 재료에 맞는 것 하나).", essential: true },
      { label: "잦아듦", guide: "몸이 편해지고, 아이가 그 느낌에 이름을 붙여 준다.", essential: true },
    ],
  },
  {
    id: "mirror",
    label: "너도 그랬구나",
    kinds: ["emotion"],
    note: "내 마음만 보이던 아이가 상대도 같은 마음이었음을 발견한다 — 다툼·질투를 다룰 때 특히 좋다.",
    minPages: 4,
    ages: [5, 9],
    beats: [
      { label: "내 마음", guide: "아이 마음이 상하는 일이 생긴다. 아이 입장에서만 보여 준다.", essential: true },
      { label: "멀어짐", guide: "그 마음 때문에 상대와 멀어진다. 서로 등을 돌린다.", weight: 1.2, essential: true },
      { label: "혼자 남음", guide: "혼자 있어 보니 생각보다 좋지 않다. 조용하고 허전하다.", weight: 1.2 },
      { label: "상대의 마음", guide: "우연히 상대도 같은 마음이었다는 걸 알게 된다(표정·혼잣말·남긴 물건).", weight: 1.2, essential: true },
      { label: "다시 함께", guide: "아이가 먼저 다가간다. 서로의 마음을 알고 다시 함께한다.", essential: true },
    ],
  },

  {
    id: "run-and-settle",
    label: "밖으로 달려 나가기",
    kinds: ["emotion"],
    note: "화를 몸으로 다 쏟아 낸 뒤, 바깥의 것들을 느끼며 저절로 가라앉는다. 말로 달래지 않는다.",
    minPages: 4,
    ages: [3, 8],
    // 「소피가 화나면, 정말 정말 화나면」(몰리 뱅, 칼데콧 명예상)의 3부 골격 —
    // 촉발 → 달리고 달려 주저앉아 욺 → 자연의 감각으로 회복 → 돌아옴.
    source: "「소피가 화나면, 정말 정말 화나면」 구조",
    beats: [
      { label: "빼앗김", guide: "아이가 아끼던 것을 누가 가져가거나, 하던 일이 뚝 끊긴다. 억울한 일이 벌어진다.", essential: true },
      { label: "확 솟구침", guide: "화가 몸으로 확 솟는다. 소리 지르고 싶고, 발을 구르고 싶고, 다 부수고 싶다.", weight: 1.2, essential: true },
      { label: "뛰쳐나감", guide: "참지 못하고 그 자리를 뛰쳐나가 달린다. 달리고 또 달린다.", weight: 1.3, essential: true },
      { label: "주저앉아 욺", guide: "더 갈 수 없는 데까지 가서 주저앉아 운다. 여기가 가장 낮은 자리다.", weight: 1.2, essential: true },
      { label: "둘레가 보임", guide: "울음이 잦아들자 둘레가 눈에 들어온다. 나뭇잎·바람·물결·새소리 같은 것을 하나씩 느낀다. 아무도 달래 주지 않는다.", weight: 1.3, essential: true },
      { label: "돌아감", guide: "마음이 가라앉아 제자리로 돌아간다. 그곳은 아무 일 없던 듯 아이를 맞아 준다.", essential: true },
    ],
  },
  {
    id: "name-the-feelings",
    label: "뒤죽박죽 마음 정리하기",
    kinds: ["emotion"],
    note: "여러 감정이 한데 엉켜 뭐가 뭔지 모를 때, 하나씩 꺼내 이름을 붙여 준다.",
    minPages: 3,
    ages: [4, 9],
    // 「컬러 몬스터」(아나 예나스)의 골격 — 엉킨 감정을 하나씩 분리해 이름을 붙이면 편해진다.
    source: "「컬러 몬스터」 구조",
    beats: [
      { label: "뒤죽박죽", guide: "마음속에 여러 감정이 한데 엉켜 있다. 아이도 자기 기분이 뭔지 설명하지 못해 답답하다.", essential: true },
      { label: "하나씩 꺼내기", guide: "엉킨 것을 하나 꺼내 본다. 그 감정에 이름을 붙이고, 몸에서 어떻게 느껴지는지 말한다.", weight: 1.3, essential: true },
      { label: "또 하나", guide: "다음 감정을 꺼낸다. 앞의 것과 어떻게 다른지 견주어 본다.", weight: 1.2, essential: true },
      { label: "남은 하나", guide: "가장 다루기 힘든 감정이 마지막에 남는다. 그것에도 이름을 붙여 준다. 나쁜 감정이라고 하지 않는다.", weight: 1.2, essential: true },
      { label: "개운함", guide: "다 정리하고 나니 마음이 한결 가볍다. 이제 아이는 자기 기분을 말로 할 수 있다.", essential: true },
    ],
  },

  /* ── 아주 어린 나이(1~4세) — 반복과 리듬이 이야기를 대신한다 ───── */
  {
    id: "hello-goodbye",
    label: "가렸다 다시 나타나기",
    kinds: ["today", "imagine", "emotion"],
    note: "좋아하는 것이 사라졌다 다시 나타난다. 사건은 하나뿐이고, 되풀이되는 인사가 이야기를 이끈다.",
    minPages: 3,
    ages: [1, 4],
    // 「달님 안녕」(하야시 아키코)의 골격 — 등장 → 가려짐 → 부탁 → 다시 나타남 → 인사.
    // 두세 살은 줄거리를 따라가지 못한다. '지금 보이는 것'과 되풀이되는 인사말이 전부다.
    source: "「달님 안녕」 구조",
    beats: [
      { label: "안녕, 하고 인사", guide: "아이가 좋아하는 것이 나타난다. 아이가 반갑게 인사한다. 같은 인사말을 정해 두고 뒤에서 되풀이한다.", essential: true },
      { label: "가려짐", guide: "무언가가 슬그머니 와서 그것을 가려 버린다. 이제 보이지 않아 아쉽다.", weight: 1.2, essential: true },
      { label: "비켜 줘", guide: "아이가 가린 것에게 말을 건다. 부탁하는 말을 두 번 되풀이한다.", weight: 1.2, essential: true },
      { label: "다시 나타남", guide: "가렸던 것이 물러나고 좋아하는 것이 다시 나타난다. 아까보다 더 환하다.", weight: 1.2, essential: true },
      { label: "또 안녕", guide: "첫 장면과 똑같은 인사말로 끝맺는다. 처음과 끝이 같아 아이가 안심한다.", essential: true },
    ],
  },
  {
    id: "peekaboo",
    label: "어디 숨었을까",
    kinds: ["today", "imagine", "emotion"],
    note: "찾고 또 찾다가 마침내 만난다. 같은 물음과 같은 몸짓이 되풀이되는 것이 재미의 전부다.",
    minPages: 3,
    ages: [1, 4],
    // 까꿍·숨바꼭질 그림책의 골격 — 같은 물음("어디 있지?")이 반복되고,
    // 매번 다른 것이 나오다가 마지막에 진짜를 찾는다. 두 살은 이 되풀이 자체를 즐긴다.
    source: "까꿍·숨바꼭질 그림책 골격",
    beats: [
      { label: "어디 있지?", guide: "찾는 것이 보이지 않는다. 아이가 묻는다. 이 물음을 뒤에서 그대로 되풀이한다.", essential: true },
      { label: "여기 있나?", guide: "한 곳을 들춰 본다. 없다. 대신 엉뚱한 것이 나와 웃음이 난다.", weight: 1.2, essential: true },
      { label: "저기 있나?", guide: "다른 곳을 들춰 본다. 또 없다. 앞 장면과 똑같은 말을 되풀이하고 나오는 것만 바꾼다.", weight: 1.3, essential: true },
      { label: "찾았다!", guide: "마침내 찾는다. 가장 크고 반가운 장면이다.", weight: 1.2, essential: true },
      { label: "꼭 안기", guide: "찾은 것을 꼭 안는다. 처음 물음과 짝이 되는 한마디로 끝맺는다.", essential: true },
    ],
  },
  {
    id: "same-way-back",
    label: "갔던 길로 되돌아",
    kinds: ["today", "imagine"],
    note: "같은 후렴을 되풀이하며 길목을 하나씩 지나가고, 마지막에 놀라 왔던 길을 거꾸로 되짚어 돌아온다.",
    minPages: 4,
    ages: [2, 6],
    // 「곰 사냥을 떠나자」(마이클 로젠·헬린 옥슨버리)의 골격 —
    // 같은 후렴 + 길목마다 다른 의성어 → 마지막 반전 → 왔던 길 역순으로 되돌아 달리기.
    source: "「곰 사냥을 떠나자」 구조",
    beats: [
      { label: "신나는 출발", guide: "무언가를 찾아 씩씩하게 떠난다. '하나도 안 무서워!' 같은 외침으로 시작하고, 이 외침을 뒤에서 계속 되풀이한다.", essential: true },
      { label: "첫 번째 길목", guide: "지나가기 힘든 것이 앞을 막는다. 돌아갈 수 없으니 뚫고 지나간다. 그때 나는 소리를 의성어로 들려준다.", weight: 1.2, essential: true },
      { label: "또 다른 길목", guide: "다른 것이 앞을 막는다. 앞 장면과 똑같은 말을 되풀이하되 소리(의성어)만 바꾼다. 되풀이가 이 이야기의 재미다.", weight: 1.3, essential: true },
      { label: "다 왔다 싶은 순간", guide: "드디어 목적지에 닿는다. 그런데 거기서 생각지도 못한 것을 만난다.", weight: 1.2, essential: true },
      { label: "되돌아 달리기", guide: "왔던 길을 거꾸로 되짚어 정신없이 달린다. 앞서 나온 길목과 소리들이 거꾸로 차례차례 지나간다.", weight: 1.3, essential: true },
      { label: "이불 속으로", guide: "집에 닿아 이불 속으로 쏙 들어간다. 무서웠지만 이제 안전하고 따뜻하다.", essential: true },
    ],
  },

  /* ── 오늘의 이야기 ─────────────────────────────────────────── */
  {
    id: "day-curve",
    label: "하루의 곡선",
    kinds: ["today"],
    note: "기대에서 어긋남으로, 그리고 실제로 끝난 대로. 진짜 있었던 일을 미화하지 않고 담는다.",
    minPages: 3,
    ages: [4, 9],
    beats: [
      { label: "기대", guide: "그 일이 있기 전, 아이가 기대하거나 즐거워하던 순간.", essential: true },
      { label: "어긋남", guide: "일이 계획과 다르게 흘러간다. 재료에 적힌 '무슨 일'이 여기서 일어난다.", weight: 1.3, essential: true },
      { label: "마음이 출렁", guide: "아이 마음이 크게 움직인다. 재료의 '그때 기분'을 몸과 행동으로 보여 준다.", weight: 1.2, essential: true },
      { label: "실제로 끝난 대로", guide: "재료의 '어떻게 끝났나'를 그대로 담는다. 혼났으면 혼난 대로, 아직 속상하면 속상한 대로 — 지어내 미화하지 않는다.", weight: 1.2, essential: true },
      { label: "남은 것", guide: "그 하루에서 아이에게 남은 것이 아이 입으로 한 문장 나온다. 훈계가 아니라 아이의 말이어야 한다.", essential: true },
    ],
  },
  {
    id: "small-discovery",
    label: "작은 발견",
    kinds: ["today", "imagine"],
    note: "잔잔한 하루에서 사소한 것을 발견하고 궁금해하다 알아낸다 — 사건이 크지 않은 날에 어울린다.",
    minPages: 3,
    ages: [2, 7],
    beats: [
      { label: "평범한 하루", guide: "여느 때와 같은 장면. 아이가 늘 하던 일을 하고 있다." },
      { label: "어? 저게 뭐지", guide: "작고 이상한 것이 눈에 띈다. 아이가 멈춰 선다.", essential: true },
      { label: "궁금해서", guide: "가까이 가 보고 만져 보고 물어본다. 궁금증이 커진다.", weight: 1.2, essential: true },
      { label: "알아냄", guide: "무엇이었는지 알게 된다. 뜻밖이면 더 좋다.", weight: 1.2, essential: true },
      { label: "달라진 눈", guide: "그 뒤로 아이에게 그 자리가 조금 다르게 보인다.", essential: true },
    ],
  },

  {
    id: "familiar-place-stranger",
    label: "늘 가던 곳에서 만난",
    kinds: ["today", "imagine"],
    note: "늘 가는 시시한 곳에서 뜻밖의 누군가를 만나 둘만의 시간을 갖고, 나중에 뜻밖의 도움을 받는다.",
    minPages: 4,
    ages: [4, 9],
    // 「장수탕 선녀님」(백희나, 한국출판문화상)의 골격 —
    // 익숙한 일상 공간 + 뜻밖의 존재 → 둘만의 놀이·비밀 → 나중의 도움.
    source: "「장수탕 선녀님」 구조",
    beats: [
      { label: "늘 가던 곳", guide: "아이가 자주 가는 익숙한 곳. 오늘은 별로 가고 싶지 않고 시시하다." },
      { label: "뜻밖의 존재", guide: "그곳에서 처음 보는 누군가를 만난다. 좀 이상하고 낡았지만 무섭지는 않다.", essential: true },
      { label: "같이 놀기", guide: "둘이 그곳에서만 할 수 있는 놀이를 한다. 시간 가는 줄 모른다.", weight: 1.3, essential: true },
      { label: "둘만의 비밀", guide: "둘만 아는 것이 생긴다. 아이는 아무한테도 말하지 않는다.", essential: true },
      { label: "뜻밖의 도움", guide: "나중에 아이가 힘들어질 때, 그 존재가 슬며시 도와준다.", weight: 1.2, essential: true },
      { label: "달라 보이는 자리", guide: "이제 그 시시하던 곳이 아이에게 가장 가고 싶은 자리가 된다.", essential: true },
    ],
  },
  {
    id: "hearing-hearts",
    label: "마음이 들리면",
    kinds: ["today", "imagine"],
    note: "둘레 사람들의 속마음을 차례로 알게 되면서, 혼자이던 아이가 먼저 다가가게 된다.",
    minPages: 4,
    ages: [5, 9],
    // 「알사탕」(백희나, 아스트리드 린드그렌상)의 골격 —
    // 외로움 → 우연한 물건 → 여러 존재의 속마음을 차례로 → 관점이 바뀌어 먼저 다가감.
    source: "「알사탕」 구조",
    beats: [
      { label: "혼자", guide: "아이가 혼자다. 다가가고 싶지만 어떻게 해야 할지 몰라 구석에서 혼자 논다.", essential: true },
      { label: "우연히 손에 든 것", guide: "우연히 무언가를 손에 넣는다. 별것 아닌 줄 알았는데 신기한 일이 일어난다.", essential: true },
      { label: "첫 번째 마음", guide: "가장 가까이 있던 것의 속마음이 들린다. 생각지도 못한 말이라 놀란다.", weight: 1.2, essential: true },
      { label: "두 번째 마음", guide: "늘 잔소리만 하던 사람, 또는 말 못 하던 이의 진짜 마음이 들린다. 아이가 알던 것과 아주 다르다.", weight: 1.3, essential: true },
      { label: "가장 그리운 마음", guide: "가장 듣고 싶었던 마음이 들린다. 뭉클하고 따뜻하다.", weight: 1.2, essential: true },
      { label: "먼저 다가감", guide: "이제 신기한 것 없이도 아이가 먼저 말을 건다. 마음은 원래 거기 있었다.", essential: true },
    ],
  },

  {
    id: "turned-out",
    label: "알고 보니",
    kinds: ["today", "imagine"],
    note: "그렇게만 보이던 것이 알고 보니 전혀 달랐다. 쪽수가 적어도 반전 하나로 이야기가 선다.",
    minPages: 3,
    ages: [5, 9],
    // 짧은 쪽수로도 성립하는 반전 구조. '내가 잘못 봤구나'는 다섯 살부터 따라온다.
    beats: [
      { label: "그렇게 보였다", guide: "아이 눈에 어떤 것이 한 가지로만 보인다. 아이는 그게 사실이라고 굳게 믿는다.", essential: true },
      { label: "그래서 그렇게 했다", guide: "믿은 대로 행동한다. 피하거나 미워하거나 앞질러 판단한다.", weight: 1.2, essential: true },
      { label: "어긋나는 조각", guide: "믿음과 안 맞는 것이 하나 눈에 띈다. 사소하지만 마음에 걸린다.", weight: 1.2, essential: true },
      { label: "알고 보니", guide: "진짜 사정이 드러난다. 아이가 본 것은 전부가 아니었다.", weight: 1.3, essential: true },
      { label: "다시 보니", guide: "같은 것이 이제 다르게 보인다. 아이가 무엇을 놓쳤는지 스스로 말한다.", essential: true },
    ],
  },
  {
    id: "two-sides",
    label: "두 마음이 다툴 때",
    kinds: ["emotion"],
    note: "하고 싶은 마음과 하기 싫은 마음이 한꺼번에 든다. 둘 다 내 마음임을 알고 하나를 고른다.",
    minPages: 3,
    ages: [6, 9],
    // 양가감정(두 마음이 동시에 드는 것)은 예닐곱 살부터 알아차린다. 짧은 쪽수에도 성립한다.
    beats: [
      { label: "하고 싶은 마음", guide: "무언가를 몹시 하고 싶다. 그 마음이 몸으로 어떻게 느껴지는지 보여 준다.", essential: true },
      { label: "그런데 싫은 마음", guide: "동시에 하기 싫은 마음도 든다. 두 마음이 한꺼번에 들어 아이가 어리둥절하다.", weight: 1.3, essential: true },
      { label: "이러지도 저러지도", guide: "두 마음 사이에서 멈춰 선다. 어느 쪽도 나쁜 마음이 아니라 둘 다 내 마음이다.", weight: 1.2, essential: true },
      { label: "하나를 고름", guide: "아이가 스스로 한쪽을 고른다. 다른 마음을 없애는 게 아니라 안고 간다.", weight: 1.2, essential: true },
      { label: "고른 뒤", guide: "고르고 나니 마음이 정해진다. 왜 그렇게 골랐는지 아이 입으로 한 문장 나온다.", essential: true },
    ],
  },

  /* ── 상상 이야기 ───────────────────────────────────────────── */
  {
    id: "three-tries",
    label: "세 번의 시도",
    kinds: ["imagine", "today"],
    note: "옛이야기의 삼세번 리듬. 두 번 실패하고 세 번째에 해내는 구조라 아이가 가장 신나 한다.",
    minPages: 4,
    ages: [3, 9],
    beats: [
      { label: "문제 등장", guide: "해내야 할 일이나 곤란한 일이 생긴다. 무엇을 해야 하는지 또렷하게 보여 준다.", essential: true },
      { label: "첫 번째 시도", guide: "아이가 한 가지 방법으로 해 본다. 잘 안 된다.", essential: true },
      { label: "두 번째 시도", guide: "다른 방법으로 다시 해 본다. 또 안 되고, 오히려 더 곤란해진다.", weight: 1.2, essential: true },
      { label: "마지막 시도", guide: "앞의 두 번에서 알게 된 것을 써서 다르게 해 본다. 이번엔 해낸다.", weight: 1.3, essential: true },
      { label: "해낸 기쁨", guide: "해낸 기쁨을 마음껏 누린다. 포기하지 않은 자기 자신을 아이가 알아본다.", essential: true },
    ],
  },
  {
    id: "there-and-back",
    label: "떠났다 돌아오기",
    kinds: ["imagine"],
    note: "일상에서 다른 세계로 갔다가 돌아온다. 돌아온 자리가 조금 달라 보이는 것이 이 구조의 맛이다.",
    minPages: 5,
    ages: [4, 9],
    beats: [
      { label: "여느 날", guide: "평범한 자리에서 이야기가 시작된다. 아이가 심심하거나 무언가 아쉬워한다." },
      { label: "열린 문", guide: "이상하고 신나는 입구가 열린다(문·구멍·탈것·초대). 아이가 건너간다.", essential: true },
      { label: "새 세계", guide: "건너간 곳을 마음껏 누빈다. 그곳에서만 볼 수 있는 것들을 보여 준다.", weight: 1.3, essential: true },
      { label: "가장 큰 고비", guide: "그곳에서 가장 큰 일이 벌어진다. 아이가 스스로 넘어선다.", weight: 1.3, essential: true },
      { label: "돌아오는 길", guide: "돌아올 시간이 된다. 그곳과 인사한다.", essential: true },
      { label: "달라진 자리", guide: "원래 자리로 돌아온다. 같은 자리인데 아이 눈에는 조금 달라 보인다.", essential: true },
    ],
  },
  {
    id: "snowball",
    label: "점점 커지는 도움",
    kinds: ["imagine", "today"],
    note: "혼자서는 안 되던 일에 하나씩 힘이 보태져 마침내 해낸다. 누적 반복이라 어린아이가 특히 좋아한다.",
    minPages: 4,
    ages: [2, 7],
    beats: [
      { label: "혼자서 끙끙", guide: "아이가 혼자 해 보지만 되지 않는다. 무엇이 안 되는지 또렷하게.", essential: true },
      { label: "첫 번째 도움", guide: "누군가 와서 함께 해 본다. 아직 부족하다.", essential: true },
      { label: "또 하나, 또 하나", guide: "하나씩 더 합류한다. 같은 말·같은 동작을 리듬처럼 반복해 준다(영차, 영차).", weight: 1.4, essential: true },
      { label: "마지막 한 사람", guide: "가장 작고 뜻밖인 이가 마지막으로 보탠다. 그 순간 해낸다.", weight: 1.2, essential: true },
      { label: "다 함께", guide: "다 같이 기뻐한다. 작은 힘도 보태지면 크다는 걸 아이가 말한다.", essential: true },
    ],
  },
  {
    id: "nobody-believed",
    label: "아무도 안 믿어 줬지만",
    kinds: ["imagine"],
    note: "아이에게 벌어진 놀라운 일을 어른이 믿어 주지 않고, 그 일이 되풀이되다 마지막에 뒤집힌다.",
    minPages: 5,
    ages: [6, 9],
    // 「지각대장 존」(존 버닝햄)의 골격 — 환상↔현실이 되풀이되고 벌이 점점 무거워지다,
    // 끝에서 어른과 아이의 자리가 뒤바뀐다.
    source: "「지각대장 존」 구조",
    beats: [
      { label: "가는 길에", guide: "어딘가로 가는 길에 믿기 어려운 일이 벌어져 아이가 늦거나 못 간다.", essential: true },
      { label: "안 믿어 줌", guide: "사실대로 말하지만 어른은 믿지 않고 지어냈다며 나무란다.", weight: 1.2, essential: true },
      { label: "또 그 일이", guide: "다음 날 또 다른 이상한 일이 벌어진다. 앞의 것보다 더 놀랍다.", weight: 1.2, essential: true },
      { label: "더 크게 혼남", guide: "이번에도 안 믿어 주고 벌이 더 무거워진다. 아이는 억울하지만 말이 통하지 않는다.", weight: 1.2, essential: true },
      { label: "뒤바뀜", guide: "이번엔 그 어른에게 똑같은 일이 벌어진다. 어른이 아이에게 도움을 청한다.", weight: 1.3, essential: true },
      { label: "아이의 대답", guide: "아이는 어른이 늘 하던 말을 그대로 돌려준다. 아이 편이 되어 주지 않았던 자리가 드러난다.", essential: true },
    ],
  },
  {
    id: "unexpected-friend",
    label: "뜻밖의 친구",
    kinds: ["imagine"],
    note: "낯선 존재와 서먹하게 만나 함께 무언가를 해내고 친구가 된다.",
    minPages: 4,
    ages: [4, 9],
    beats: [
      { label: "혼자", guide: "아이가 혼자 있다. 조금 심심하거나 아쉽다." },
      { label: "낯선 만남", guide: "처음 보는 존재를 만난다. 서로 조심스럽고 서먹하다.", essential: true },
      { label: "오해", guide: "서로를 잘 몰라 어긋난다. 잠시 사이가 나빠진다.", weight: 1.2, essential: true },
      { label: "함께 해냄", guide: "둘이 힘을 합쳐야만 되는 일이 생기고, 함께 해낸다.", weight: 1.3, essential: true },
      { label: "약속", guide: "헤어지며 다시 만날 약속을 한다. 아이에게 친구가 하나 생겼다.", essential: true },
    ],
  },
];

/**
 * 무게에 따라 쪽을 나눈다(최대잉여법). 반드시 살아야 하는 뼈대(essential)는
 * 쪽수가 모자라도 한 쪽은 받게 보정한다.
 */
function allocatePages(beats: Beat[], pageCount: number): number[] {
  const weights = beats.map((b) => b.weight ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / total) * pageCount);
  const counts = raw.map((r) => Math.floor(r));

  // 남은 쪽은 소수부가 큰 뼈대부터 하나씩.
  let remaining = pageCount - counts.reduce((a, b) => a + b, 0);
  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < byFraction.length && remaining > 0; k++) {
    counts[byFraction[k].i] += 1;
    remaining -= 1;
  }
  // 그래도 남으면(쪽이 뼈대보다 훨씬 많을 때) 무거운 뼈대부터 돌아가며 더 준다.
  const byWeight = weights.map((w, i) => ({ i, w })).sort((a, b) => b.w - a.w);
  for (let k = 0; remaining > 0; k++) {
    counts[byWeight[k % byWeight.length].i] += 1;
    remaining -= 1;
  }

  // 꼭 필요한 뼈대가 0쪽이면, 가장 많이 가진 뼈대에서 한 쪽을 빌려 온다.
  for (let i = 0; i < beats.length; i++) {
    if (!beats[i].essential || counts[i] > 0) continue;
    let donor = -1;
    let best = 1; // 2쪽 이상 가진 뼈대에서만 빌린다
    for (let j = 0; j < counts.length; j++) {
      if (counts[j] > best) {
        best = counts[j];
        donor = j;
      }
    }
    if (donor >= 0) {
      counts[donor] -= 1;
      counts[i] = 1;
    }
  }
  return counts;
}

/**
 * 뼈대를 쪽수에 맞춰 배분한다. 반환값은 길이가 pageCount인 배열이고,
 * 각 칸은 그 쪽이 담아야 할 뼈대들이다.
 *
 * · 뼈대가 쪽보다 많으면 → 한 쪽이 여러 뼈대를 담는다(합치기).
 * · 뼈대가 쪽보다 적으면 → 한 뼈대가 여러 쪽에 걸친다(늘리기).
 */
export function distributeBeats(beats: Beat[], pageCount: number): Beat[][] {
  if (pageCount <= 0 || beats.length === 0) return [];
  const counts = allocatePages(beats, pageCount);
  const pages: Beat[][] = Array.from({ length: pageCount }, () => []);

  let page = 0;
  let carry: Beat[] = []; // 쪽을 못 받은 뼈대 — 다음 쪽에 함께 담는다
  for (let i = 0; i < beats.length; i++) {
    const count = counts[i];
    if (count === 0) {
      carry.push(beats[i]);
      continue;
    }
    for (let k = 0; k < count && page < pageCount; k++) {
      pages[page] = [...carry, beats[i]];
      carry = [];
      page += 1;
    }
  }
  // 맨 뒤에 남은 것들은 마지막 쪽에 얹는다.
  if (carry.length > 0) pages[pageCount - 1] = [...pages[pageCount - 1], ...carry];
  return pages;
}

/**
 * 갈래·쪽수·나이에 맞는 뼈대를 한 장 고른다.
 *
 * 나이를 보는 이유: 두 살에게 반전이 있는 골격을 주면 따라오지 못하고, 여덟 살에게
 * 단순 반복을 주면 시시해진다. 글자수(lengthGuide)만으로는 이걸 못 맞춘다.
 *
 * 「직접 이야기 구성」(direct)은 부모가 짠 구조가 이미 있으므로 뼈대를 씌우지 않는다 —
 * 씌우면 부모가 쓴 흐름과 싸운다.
 *
 * rand를 받는 이유는 테스트에서 결과를 고정하기 위해서다. 실제로는 매번 무작위로
 * 골라, 같은 재료로 다시 만들어도 다른 구조의 이야기가 나오게 한다.
 */
export function pickBeatTemplate(
  kind: StoryKind,
  pageCount: number,
  age: number,
  rand: () => number = Math.random,
): BeatTemplate | null {
  if (kind === "direct") return null;
  const ofKind = BEAT_TEMPLATES.filter((t) => t.kinds.includes(kind));
  if (ofKind.length === 0) return null;

  const fitsPages = (t: BeatTemplate) => t.minPages <= pageCount;
  const fitsAge = (t: BeatTemplate) => age >= t.ages[0] && age <= t.ages[1];
  /** 나이가 범위 밖일 때 얼마나 벗어났는지 — 가장 가까운 카드로 내려앉기 위해. */
  const ageGap = (t: BeatTemplate) =>
    age < t.ages[0] ? t.ages[0] - age : age > t.ages[1] ? age - t.ages[1] : 0;

  // ① 나이·쪽수 둘 다 맞는 카드 → ② 쪽수만 맞는 카드 중 나이가 가장 가까운 것들
  // → ③ 그래도 없으면 가장 짧은 카드. 어느 단계든 후보가 여럿이면 무작위로 하나.
  let pool = ofKind.filter((t) => fitsPages(t) && fitsAge(t));
  if (pool.length === 0) {
    const byPages = ofKind.filter(fitsPages);
    if (byPages.length > 0) {
      const nearest = Math.min(...byPages.map(ageGap));
      pool = byPages.filter((t) => ageGap(t) === nearest);
    } else {
      const shortest = Math.min(...ofKind.map((t) => t.minPages));
      pool = ofKind.filter((t) => t.minPages === shortest);
    }
  }
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rand() * pool.length)));
  return pool[index];
}

/**
 * 고른 뼈대를 줄거리 프롬프트에 넣을 여러 줄로 만든다.
 *
 * 뼈대는 '무슨 일이 일어나는가'만 정하고, 소재·인물·대사는 부모가 넣은 재료에서
 * 나와야 한다 — 그 경계를 프롬프트에서 못 박아 준다. 안 그러면 뼈대의 예시 단어
 * (베개, 문, 영차 같은)가 그대로 본문에 튀어나온다.
 */
export function beatPlanLines(template: BeatTemplate, pageCount: number): string[] {
  const pages = distributeBeats(template.beats, pageCount);
  const lines: string[] = [
    `이야기 뼈대: ${template.label} — ${template.note}`,
    `아래 장면별 뼈대를 그대로 따라 배열한다. 뼈대는 '무슨 일이 일어나는가'만 정한 것이고,`,
    `소재·인물·장소·대사는 반드시 위의 재료에서 가져온다. 뼈대에 적힌 예시 단어를 그대로 쓰지 않는다.`,
    `뼈대 이름이나 '기승전결' 같은 말은 본문에 절대 쓰지 않는다.`,
  ];
  let previousLabel = "";
  pages.forEach((beats, index) => {
    if (beats.length === 0) return;
    const body = beats
      .map((b) => (b.label === previousLabel ? `${b.label}(이어서) — ${b.guide}` : `${b.label} — ${b.guide}`))
      .join(" / ");
    lines.push(`  ${index + 1}장면: ${body}`);
    previousLabel = beats[beats.length - 1].label;
  });
  return lines;
}
