/* =====================================================================
   NEON TEXAS HOLD'EM  -  js/pokerbots.js
   বটদের সিদ্ধান্ত ও ভাবার সময়।
   প্রতিটি বটের নিজস্ব স্বভাব ও ভাবার সময় pokerconfig.js এর BOT_POOL এ (সেখানেই বদলান)।
   বট শুধু নিজের কার্ড আর টেবিলের কার্ড জানে। অন্যদের কার্ড সে দেখে না।

   game.js এর ব্যবহার:
     await sleep(PokerBots.thinkTime(p));               // প্রত্যেকের আলাদা ৫-৬ সেকেন্ড
     const d = PokerBots.decide(game, p);               // {action:'raise', amount:45000}
     game.act(p.id, d.action, d.amount);
   ===================================================================== */
'use strict';

const PokerBots = (() => {
  const K = PokerConfig;

  const DEFAULT = { aggression: 0.5, bluff: 0.1, caution: 1.0, loose: 0.1, think: K.BOT_THINK_DEFAULT };

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function profileFor(p) { return (p && p.profile) || DEFAULT; }

  // বটের "ভাবার" সময় (ms): প্রত্যেক বটের নিজস্ব সীমার মধ্যে র‍্যান্ডম
  function thinkTime(p) {
    const t = profileFor(p).think || K.BOT_THINK_DEFAULT;
    return Math.round(K.rand(t[0], t[1]));
  }

  function chooseRaiseTo(game, p, la, strength, monster, bluff) {
    const unit = la.unit;
    let mult = 1;
    if (!bluff) mult = strength >= 2.4 ? 3 : strength >= 1.9 ? 2 : 1;
    let target = game.currentBet + unit * mult;
    if (monster && Math.random() < 0.5) target = Math.max(target, la.potRaiseTo);
    target = clamp(target, la.minRaiseTo, la.maxRaiseTo);
    // স্ট্যাকের বড় অংশ চলে গেলে সরাসরি অল-ইন (ব্লাফে নয়)
    if (!bluff && (target - p.bet) > p.chips * 0.6) target = la.maxRaiseTo;
    return clamp(K.snap(target), la.minRaiseTo, la.maxRaiseTo);
  }

  // সিদ্ধান্ত: {action:'fold'|'check'|'call'|'raise', amount?}
  function decide(game, p) {
    const prof = profileFor(p);
    const la = game.legalActions(p);
    const live = game.players.filter(x => !x.folded);
    const n = live.length;

    const sims = game.community.length === 0 ? 140 : 200;
    let equity = PokerCards.estimateEquity(p.hole, game.community, n - 1, sims);
    equity = clamp(equity + (Math.random() - 0.5) * 0.08, 0, 1);   // সামান্য এলোমেলো ভাব

    const strength = equity * n;                      // ১ = গড় হাত
    const monster = strength >= 2.1 || equity >= 0.88;
    const potOdds = la.toCall > 0 ? la.toCall / (game.pot + la.toCall) : 0;
    const commit = la.toCall / Math.max(1, p.chips);  // স্ট্যাকের কত অংশ লাগবে

    // --- রেইজ ---
    const valueChance = monster ? Math.min(1, prof.aggression + 0.3) : prof.aggression;
    const wantsValue = la.canRaise && strength >= 1.6 && Math.random() < valueChance;

    const cheapBluff = la.canRaise && (la.minRaiseTo - p.bet) <= p.chips * 0.35;
    const bluffChance = prof.bluff * (la.toCall === 0 ? 1 : 0.4);
    const wantsBluff = !wantsValue && cheapBluff && strength < 1.1 && Math.random() < bluffChance;

    if (wantsValue || wantsBluff) {
      return { action: 'raise', amount: chooseRaiseTo(game, p, la, strength, monster, wantsBluff) };
    }

    // --- ফ্রি চেক ---
    if (la.canCheck) return { action: 'check' };

    // --- বেট এর মুখে: কল না ফোল্ড ---
    const need = potOdds * prof.caution;
    let ok = equity >= need && strength >= 0.85;
    if (!ok && potOdds < 0.12 && strength >= 0.7) ok = true;                       // খুব সস্তা কল
    if (!ok && equity >= need * 0.8 && Math.random() < prof.loose) ok = true;      // কৌতূহলী কল
    if (ok && commit > 0.5 && strength < 1.3 && !monster) ok = false;              // স্ট্যাক বাঁচানো

    return { action: ok ? 'call' : 'fold' };
  }

  return { decide, thinkTime, profileFor };
})();
