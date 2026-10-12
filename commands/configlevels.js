// dash-bot/commands/configlevels.js
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

const ADMIN_IDS = ['1161557418073931807'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configlevels')
    .setDescription('Configura el canal donde llegarán las solicitudes de nuevos niveles')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('El canal de texto para revisar niveles')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Sin permisos de administración.', flags: 64 });
    }

    const channel = interaction.options.getChannel('canal');
    const db = getDatabase();

    try {
      await interaction.deferReply({ flags: 64 });

      await db.ref('settings/channels').update({
        levelsChannelId: channel.id,
        updatedBy: interaction.user.tag,
        updatedAt: Date.now()
      });

      return interaction.editReply({
        content: `✅ **Canal Configurado**: Las solicitudes de niveles (con Showcase, Verificación y Raw Footage) ahora se enviarán a ${channel}.`
      });
    } catch (error) {
      console.error('Error en configlevels:', error);
      return interaction.editReply({ content: '❌ Ocurrió un error al guardar el canal en la base de datos.' });
    }
  }
};
