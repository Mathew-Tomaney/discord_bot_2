import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { soundboard } from '../soundboard.js';
import { UserError, ensurePlayer, replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder()
  .setName('sfx')
  .setDescription('Soundboard: play sound effects over the music')
  .addSubcommand((s) =>
    s
      .setName('play')
      .setDescription('Play a sound effect')
      .addStringOption((o) => o.setName('name').setDescription('Sound name').setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('volume').setDescription('Volume for this clip, 1-200%').setMinValue(1).setMaxValue(200)),
  )
  .addSubcommand((s) => s.setName('list').setDescription('List all available sound effects'))
  .addSubcommand((s) => s.setName('stop').setDescription('Cut off any sound effects that are playing'))
  .addSubcommand((s) =>
    s
      .setName('volume')
      .setDescription('Set the overall soundboard volume (0-200%)')
      .addIntegerOption((o) => o.setName('percent').setDescription('Volume percentage').setRequired(true).setMinValue(0).setMaxValue(200)),
  )
  .addSubcommand((s) => s.setName('reload').setDescription('Rescan the sound folders for new files'));

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const names = soundboard.search(focused, 25);
  await interaction.respond(names.map((n) => ({ name: n, value: n }))).catch(() => {});
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  try {
    switch (sub) {
      case 'play': {
        const name = interaction.options.getString('name', true);
        const volume = (interaction.options.getInteger('volume') ?? 100) / 100;
        await interaction.deferReply();
        const player = await ensurePlayer(interaction);
        const { name: played, seconds } = await player.playSfx(name, { volume });
        await interaction.editReply(`🔊 **${played}** (${seconds.toFixed(1)}s)`);
        break;
      }
      case 'list': {
        const names = soundboard.list();
        if (!names.length) {
          throw new UserError(
            'No sound effects found. Drop audio files into the `sounds/` folder (or run `npm run sfx` to generate the built-in set).',
          );
        }
        const embed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(`Soundboard (${names.length})`)
          .setDescription(names.map((n) => `\`${n}\``).join(' ').slice(0, 4000))
          .setFooter({ text: 'Play one with /sfx play <name>' });
        await interaction.reply({ embeds: [embed] });
        break;
      }
      case 'stop': {
        const player = requirePlayer(interaction);
        const n = player.stopSfx();
        await interaction.reply(n ? `Stopped ${n} sound effect${n === 1 ? '' : 's'}.` : 'No sound effects were playing.');
        break;
      }
      case 'volume': {
        const player = requirePlayer(interaction);
        const pct = interaction.options.getInteger('percent', true);
        player.sfxVolume = pct / 100;
        await interaction.reply(`Soundboard volume set to **${pct}%**.`);
        break;
      }
      case 'reload': {
        const n = soundboard.scan();
        await interaction.reply(`Rescanned. ${n} sound effect${n === 1 ? '' : 's'} available.`);
        break;
      }
    }
  } catch (err) {
    await replyError(interaction, err);
  }
}
