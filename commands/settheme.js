// dash-bot/commands/settheme.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const admin = require('firebase-admin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settheme')
    .setDescription('Cambia el tema visual de la DashList globalmente en la web')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    const selectedPack = interaction.options.getString('pack');
    const db = admin.database();

    try {
      await interaction.deferReply();

      // Guardar en la rama settings/config
      await db.ref('settings/config').update({
        currentSeason: selectedPack,
        updatedBy: interaction.user.tag,
        updatedAt: Date.now()
      });

      return interaction.editReply({
        content: `🎨 **¡Tema Global Actualizado!**\nLa web **DashList** cambiará en vivo al paquete: **\`${selectedPack.toUpperCase()}\`**.`
      });
    } catch (error) {
      console.error(error);
      return interaction.editReply({ content: '❌ Ocurrió un error al actualizar el tema en la base de datos.' });
    }
  }
};