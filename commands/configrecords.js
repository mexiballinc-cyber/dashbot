// dash-bot/commands/configrecords.js
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

const ADMIN_IDS = ['1161557418073931807'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configrecords')
    .setDescription('Configura el canal donde llegarán los récords enviados desde la web o el servidor')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('El canal de texto para revisar récords')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 }).catch(() => {});

    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.editReply({ content: '❌ Sin permisos de administración.' });
    }

    const channel = interaction.options.getChannel('canal');
    const db = getDatabase();

    try {
      await db.ref('settings/channels').update({
        recordsChannelId: channel.id,
        updatedBy: interaction.user.tag,
        updatedAt: Date.now()
      });

      return interaction.editReply({
        content: `✅ **Canal de Récords Configurado**: Las solicitudes de récords ahora se enviarán a ${channel}.`
      });
    } catch (error) {
      console.error('Error en configrecords:', error);
      return interaction.editReply({ content: '❌ Ocurrió un error al guardar el canal en la base de datos.' });
    }
  }
};
