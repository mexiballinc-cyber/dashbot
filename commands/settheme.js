// dash-bot/commands/settheme.js
const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

const ADMIN_IDS = ['1161557418073931807'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settheme')
    .setDescription('Cambia el tema visual de la DashList globalmente en la web')
    .addStringOption(option =>
      option.setName('pack')
        .setDescription('Elige el paquete de temporada')
        .setRequired(true)
        .addChoices(
          { name: 'Normal / Clásico', value: 'normal' },
          { name: 'Otoño (Halloween)', value: 'otono' },
          { name: 'Invierno (Navidad)', value: 'invierno' },
          { name: 'México', value: 'mexico' }
        )
    ),

  async execute(interaction) {
    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Sin permisos.', flags: 64 });
    }

    const selectedPack = interaction.options.getString('pack');

    try {
      await interaction.deferReply({ flags: 64 });
      const db = getDatabase();

      await db.ref('settings/config').update({
        currentSeason: selectedPack,
        updatedBy: interaction.user.tag,
        updatedAt: Date.now()
      });

      return interaction.editReply({
        content: `🎨 **¡Tema Global Actualizado!**\nLa web **DashList** cambiará en vivo al paquete: **\`${selectedPack.toUpperCase()}\`**.`
      });
    } catch (error) {
      console.error('Error en settheme:', error);
      return interaction.editReply({ content: '❌ Ocurrió un error al actualizar el tema en la base de datos.' });
    }
  }
};
