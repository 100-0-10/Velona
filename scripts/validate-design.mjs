import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../docs/design/data/', import.meta.url));
const catalog = {};
let checks = 0;
function verify(condition, message) {
  checks++;
  assert.ok(condition, message);
}
for (const name of await readdir(root)) {
  if (!name.endsWith('.json') || name === 'validation_report.json') continue;
  const json = JSON.parse(await readFile(path.join(root, name), 'utf8'));
  verify(json.schema_version === 1, `${name}: unsupported schema`);
  verify(json.status === 'design_draft', `${name}: content status`);
  catalog[name.slice(0, -5)] = json.records;
}
const byId = {};
for (const [name, rows] of Object.entries(catalog)) {
  if (!Array.isArray(rows) || !rows[0]?.id) continue;
  byId[name] = new Map(rows.map(row => [row.id, row]));
  verify(byId[name].size === rows.length, `${name}: duplicate ids`);
}
const hasItems = values => Object.keys(values).every(id => byId.items.has(id));
const validQuantities = values => Object.values(values).every(n => Number.isSafeInteger(n) && n > 0);
for (const recipe of catalog.recipes) {
  verify(byId.stations.has(recipe.station_id), `${recipe.id}: unknown station`);
  verify(byId.unlocks.has(recipe.unlock), `${recipe.id}: unknown unlock`);
  verify(hasItems(recipe.inputs) && hasItems(recipe.outputs), `${recipe.id}: unknown ingredient/output`);
  verify(validQuantities(recipe.inputs) && validQuantities(recipe.outputs), `${recipe.id}: invalid quantity`);
  verify(Number.isFinite(recipe.duration_seconds) && recipe.duration_seconds >= 0, `${recipe.id}: duration`);
  if (recipe.material_slots) {
    const ids = recipe.material_slots.flatMap(slot => slot.item_ids);
    verify(new Set(ids).size === ids.length && ids.length === Object.keys(recipe.inputs).length && ids.every(id => id in recipe.inputs), `${recipe.id}: material slots`);
    verify(Math.abs(recipe.material_slots.reduce((sum, slot) => sum + slot.normalized_weight, 0) - 1) < 0.00001, `${recipe.id}: slot weights`);
  }
  for (const group of recipe.substitution_groups ?? []) {
    verify(group.replace_item_id in recipe.inputs && group.replace_quantity === recipe.inputs[group.replace_item_id], `${recipe.id}: substitution target`);
    for (const choice of group.choices) verify(hasItems(choice.inputs) && validQuantities(choice.inputs) && (!choice.extra_trait_id || byId.traits.has(choice.extra_trait_id)), `${recipe.id}: substitution ingredient/trait`);
  }
}
for (const station of catalog.stations) {
  verify(hasItems(station.build_cost) && validQuantities(station.build_cost), `${station.id}: build cost`);
  verify(station.prerequisite_stations.every(id => byId.stations.has(id)), `${station.id}: station prerequisite`);
  verify(byId.unlocks.has(station.unlock), `${station.id}: station unlock`);
}
for (const monster of catalog.monsters) {
  verify(byId.regions.has(monster.region_id), `${monster.id}: region`);
  verify(monster.stats_at_reference_players.hp > 0, `${monster.id}: hp`);
  verify(hasItems(monster.base_harvest), `${monster.id}: base rewards`);
  for (const range of Object.values(monster.base_harvest)) verify(range.min > 0 && range.max >= range.min, `${monster.id}: reward range`);
  verify(monster.focus_options.length === 3, `${monster.id}: focus choices`);
  for (const focus of monster.focus_options) verify(hasItems(focus.guaranteed) && validQuantities(focus.guaranteed), `${monster.id}: focus reward`);
  for (const bonus of monster.optional_bonus_rolls) verify(byId.items.has(bonus.item_id) && bonus.probability >= 0 && bonus.probability <= 1, `${monster.id}: bonus reward`);
  for (const id of monster.equipment_ids) {
    verify(byId.equipment.has(id), `${monster.id}: equipment`);
    verify(catalog.recipes.some(recipe => id in recipe.outputs && monster.signature_processed_item_id in recipe.inputs), `${monster.id}: signature material route`);
  }
}
for (const equipment of catalog.equipment) {
  verify(byId.items.has(equipment.item_id), `${equipment.id}: item template`);
  verify(equipment.fixed_trait_ids.every(id => byId.traits.has(id)), `${equipment.id}: trait`);
  verify(catalog.recipes.some(recipe => equipment.item_id in recipe.outputs), `${equipment.id}: missing craft recipe`);
}
for (const source of catalog.sources) {
  verify(byId.items.has(source.item_id), `${source.id}: source item`);
  verify(!source.monster_id || byId.monsters.has(source.monster_id), `${source.id}: source monster`);
  verify((source.region_ids ?? []).every(id => byId.regions.has(id)), `${source.id}: source region`);
}
for (const upgrade of catalog.upgrades) verify(byId.stations.has(upgrade.station_id) && hasItems(upgrade.cost), `${upgrade.id}: upgrade`);
for (const operation of catalog.operations) verify(byId.stations.has(operation.station_id) && hasItems(operation.max_material_cost), `${operation.id}: operation`);
for (const facility of catalog.life_facilities) verify(hasItems(facility.build_cost) && facility.outputs.every(id => byId.items.has(id)), `${facility.id}: facility`);

// Check reachability independently of the old generated validation report.
const available = new Set(catalog.sources.filter(source => ['gathering', 'guaranteed_exploration', 'monster_base', 'monster_focus', 'decay'].includes(source.kind)).map(source => source.item_id));
const stations = new Set(['hand', 'build']);
const unlocks = new Set(catalog.unlocks.filter(row => ['initial', 'discovery'].includes(row.kind)).map(row => row.id));
let previous = '';
while (previous !== `${available.size}:${stations.size}:${unlocks.size}`) {
  previous = `${available.size}:${stations.size}:${unlocks.size}`;
  for (const station of catalog.stations) if (unlocks.has(station.unlock) && station.prerequisite_stations.every(id => stations.has(id)) && Object.keys(station.build_cost).every(id => available.has(id))) stations.add(station.id);
  for (const unlock of catalog.unlocks) {
    if (unlock.kind === 'research' && stations.has(unlock.station_id) && unlock.requires.every(id => unlocks.has(id)) && Object.keys(unlock.cost).every(id => available.has(id))) unlocks.add(unlock.id);
    if (unlock.kind === 'upgrade') {
      const upgrade = byId.upgrades.get(unlock.upgrade_id);
      if (upgrade && stations.has(upgrade.station_id) && Object.keys(upgrade.cost).every(id => available.has(id))) unlocks.add(unlock.id);
    }
  }
  for (const recipe of catalog.recipes) if (stations.has(recipe.station_id) && unlocks.has(recipe.unlock) && Object.keys(recipe.inputs).every(id => available.has(id))) for (const id of Object.keys(recipe.outputs)) available.add(id);
  if (available.has('feed')) for (const source of catalog.sources.filter(source => source.kind === 'livestock')) available.add(source.item_id);
  if (stations.has('repair') && available.has('iron')) available.add('scrap_iron');
}
for (const station of catalog.stations) verify(stations.has(station.id), `${station.id}: unreachable station`);
for (const equipment of catalog.equipment) verify(available.has(equipment.id), `${equipment.id}: unreachable equipment`);
console.log(`Design data passed ${checks} checks: ${catalog.regions.length} regions, ${catalog.monsters.length} monsters, ${catalog.items.length} items, ${catalog.recipes.length} recipes.`);
