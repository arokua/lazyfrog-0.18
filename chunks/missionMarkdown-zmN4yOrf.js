const enemyNames = {
  golemBaby: "Baby Golem",
  slimeKnight: "Slime Knight",
  slimeBigMouth: "Chomp Slime",
  slimeCat: "Cat Slime",
  slimeGems: "Crystal Slime",
  skeleton: "Warrior Skeleton",
  skelNoHead: "Headless Skeleton",
  golemMountain: "Mountain Golem",
  golemMountainLucky: "Loaded Mountain Golem",
  golemBoar: "Boar Golem",
  skelFireHead: "Flaming Skeleton",
  skelIceHead: "Ice Flame Skeleton",
  skelArcher: "Ranger Skeleton",
  skel2Axe: "Barbarian Skeleton",
  slimeBone: "Bone Slime",
  slimeBoneLucky: "Loaded Bone Slime",
  mushroomSmall: "Bitey Shroom",
  mushroomLarge: "Erin-guy",
  mushroomLargeBoss: "Boss Mushroom",
  skelWizard: "Wizard Skeleton",
  skelGreatSword: "Swordsman Skeleton",
  skelGreatSwordLucky: "Loaded Swordsman Skeleton",
  skelAssassin: "Assassin Skeleton",
  cannibal: "Shadowbearer",
  darkBat: "Shadow Wing",
  darkShaman: "Shadowbringer",
  darkChild: "Shadowkin",
  darkBigGuy: "Shadow Brute",
  darkBigGuyLucky: "Loaded Shadow Brute",
  darkHand: "Arm of Shadow",
  darkWizard: "Shadow Conjurer",
  darkGiantHorns: "Hollowhorn",
  darkWorm: "Shadow Hatchling",
  darkSpider: "Skittering Shadow",
  darkDemon: "Umbral Winged Shadeborn",
  mushroomChild: "Shroomkin",
  mushroomFrog: "Sporehead",
  mushroomSoldierLucky: "Loaded Sporehead",
  mushroomSoldier: "Sporewarden",
  livingArmor: "Steel Revenant",
  mushroomMonster: "Sturdy Sporeborn",
  mushroomTeeth: "Mawcap",
  woodGolem: "Heartroot Guardian",
  icyWoodGolem: "Frostroot Guardian",
  woodOctopus: "Branchclutch",
  woodRoof: "Stumpkin",
  robotNo1: "Y5-Sentry",
  robotNo2: "KRG-01",
  robotNo3: "Gen5-HVY",
  robotNo4: "Medibot-Mark IV",
  robotNo5: "WasteLogic LX-9",
  robotNo5Lucky: "Loaded WasteLogic LX-9",
  robotNo6: "BRX-7 Sentry Chassis",
  robotNo7: "Minifax Model B",
  robotBoss: "Slumbering Guardian-X5"
};
const mapNames = {
  fields: "Fields",
  outer_temple: "Outer Temple",
  forbidden_city: "Forbidden City",
  mossy_forest: "Mossy Forest",
  mountain_pass: "Mountain Pass",
  new_eden: "New Eden",
  ruined_path: "Ruined Path",
  seaside_cliffs: "Seaside Cliffs"
};
function generateMissionMarkdown(mission) {
  if (!mission.encounters || mission.encounters.length === 0) {
    return null;
  }
  const encounters = mission.encounters;
  const stars = "⭐".repeat(mission.difficulty || 0);
  const mapName = mapNames[mission.environment || ""] || mission.environment || "Unknown";
  const title = mission.missionTitle || mission.foodName || "Mission";
  let markdown = `### ${stars} ${title}
`;
  markdown += `**Map:** ${mapName} | **Level:** ${mission.minLevel}-${mission.maxLevel}

`;
  markdown += `| # | Room | Details |
`;
  markdown += `|---|------|----------|
`;
  encounters.forEach((enc, index) => {
    const roomNum = index + 1;
    const roomIcon = getEncounterIcon(enc.type);
    const roomType = getEncounterTypeName(enc.type);
    const details = getEncounterDetails(enc, mission.foodName);
    markdown += `| ${roomNum} | ${roomIcon} ${roomType} | ${details} |
`;
  });
  return markdown;
}
function getEncounterIcon(type) {
  const icons = {
    enemy: "⚔️",
    boss: "👑",
    rushBoss: "👑",
    crossroadsFight: "🔱",
    skillBargain: "🔮",
    abilityChoice: "⛩",
    treasure: "💎",
    investigate: "🏚️",
    statsChoice: "📊",
    blessing: "🙏",
    shopEquipment: "🛒",
    shopAbility: "🛒"
  };
  return icons[type] || "❓";
}
function getEncounterTypeName(type) {
  const names = {
    enemy: "Battle",
    boss: "Boss",
    rushBoss: "Boss",
    crossroadsFight: "Miniboss",
    skillBargain: "Monolith",
    abilityChoice: "Shrine",
    treasure: "Treasure",
    investigate: "Hut",
    statsChoice: "Stat Choice",
    blessing: "Blessing",
    shopEquipment: "Vending",
    shopAbility: "Vending"
  };
  return names[type] || type;
}
function getEncounterDetails(enc, foodName) {
  switch (enc.type) {
    case "enemy":
    case "boss":
    case "rushBoss":
    case "crossroadsFight":
      return formatEnemies(enc.enemies || []);
    case "skillBargain":
      return formatSkillBargain(enc);
    case "abilityChoice":
      return formatAbilityChoice(enc);
    case "shopEquipment":
    case "shopAbility":
      return formatShop();
    case "treasure":
      return foodName || "Treasure!";
    case "investigate":
      return "Hut";
    default:
      return "";
  }
}
function formatEnemies(enemies) {
  if (!enemies || enemies.length === 0) return "???";
  const enemyCounts = {};
  enemies.forEach((enemy) => {
    const name = enemyNames[enemy.type] || enemy.type;
    enemyCounts[name] = (enemyCounts[name] || 0) + 1;
  });
  const parts = Object.entries(enemyCounts).map(([name, count]) => {
    if (count > 1) {
      return `${count}× ${name}`;
    }
    return name;
  });
  return parts.join(" · ");
}
function formatSkillBargain(enc) {
  const positive = enc.positiveEffect;
  const negative = enc.negativeEffect;
  const posStat = formatStatName(positive?.stat);
  const negStat = formatStatName(negative?.stat);
  return `⬆️${posStat} + ⬇️${negStat}`;
}
function formatAbilityChoice(enc) {
  const abilities = [];
  if (enc.optionA?.abilityId) abilities.push(formatAbilityName(enc.optionA.abilityId));
  if (enc.optionB?.abilityId) abilities.push(formatAbilityName(enc.optionB.abilityId));
  if (enc.optionC?.abilityId) abilities.push(formatAbilityName(enc.optionC.abilityId));
  if (abilities.length === 0) return "???";
  const enchanted = enc.isEnchanted ? "✨ Enchanted  \n" : "";
  return `${enchanted}• ${abilities.join(" • ")}`;
}
function formatAbilityName(abilityId) {
  const readable = abilityId.replace(/([A-Z])/g, " $1").trim().replace(/On Turn Start/i, "(Start)").replace(/On Turn End/i, "(End)").replace(/On Crit/i, "(Crit)").replace(/On Hit/i, "(Hit)").replace(/On Kill/i, "(Kill)");
  return readable;
}
function formatShop(enc) {
  return "Shop items available";
}
function formatStatName(stat) {
  if (!stat) return "???";
  const names = {
    attack: "Attack",
    defense: "Defense",
    speed: "Speed",
    dodge: "Dodge",
    maxHp: "HP",
    critChance: "Crit"
  };
  return names[stat] || stat;
}
export {
  generateMissionMarkdown
};
