// dash-bot/index.js
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  REST, 
  Routes, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs');

// Cargar credenciales de Firebase
const serviceAccount = require('./firebase-key.json');

// Inicialización limpia y moderna de Firebase Admin SDK
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: "https://dashlist-3fbec-default-rtdb.firebaseio.com"
  });
}

const db = getDatabase();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const commandsArray = [];

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
  commandsArray.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Cargando comandos Slash...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commandsArray }
    );
    console.log('¡Comandos cargados exitosamente!');
  } catch (error) {
    console.error('Error al registrar comandos Slash:', error);
  }
})();

// Escuchar NIVELES y RÉCORDS pendientes en tiempo real
function listenForPendingItems() {
  // 1. Escuchar Niveles Pendientes desde la Web
  db.ref('pending_levels').on('child_added', async (snapshot) => {
    const data = snapshot.val();
    const key = snapshot.key;
    if (data.notified) return;

    const channelSnap = await db.ref('settings/channels/levelsChannelId').once('value');
    const channelId = channelSnap.val();
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`📥 Nueva Solicitud de Nivel: ${data.name}`)
      .setColor(0x5865F2)
      .setThumbnail(data.imgurUrl || null)
      .addFields(
        { name: 'Dificultad', value: `${data.difficulty}`, inline: true },
        { name: 'ID del Nivel', value: `${data.gdId}`, inline: true },
        { name: 'Creador (ID)', value: `<@${data.creatorId}> (\`${data.creatorId}\`)`, inline: true },
        { name: 'Verificador (ID)', value: `<@${data.verifierId}> (\`${data.verifierId}\`)`, inline: true }
      )
      .setFooter({ text: `Key: ${key}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_level_${key}`).setLabel('Aceptar Nivel').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_level_${key}`).setLabel('Rechazar Nivel').setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await db.ref(`pending_levels/${key}/notified`).set(true);
  });

  // 2. Escuchar Récords Pendientes desde la Web o Discord
  db.ref('pending_records').on('child_added', async (snapshot) => {
    const data = snapshot.val();
    const key = snapshot.key;
    if (data.notified) return;

    const channelSnap = await db.ref('settings/channels/recordsChannelId').once('value');
    const channelId = channelSnap.val() || (await db.ref('settings/channels/levelsChannelId').once('value')).val();
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Nuevo Récord Enviado: ${data.levelName}`)
      .setColor(0xFEE75C)
      .addFields(
        { name: 'Jugador', value: `${data.playerName}`, inline: true },
        { name: 'Progreso', value: `${data.progress}%`, inline: true },
        { name: 'País', value: `${data.country || 'N/A'}`, inline: true },
        { name: 'Video Prueba', value: `${data.videoUrl || data.video}` }
      )
      .setFooter({ text: `Key: ${key}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_record_${key}`).setLabel('Aceptar Récord').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_record_${key}`).setLabel('Rechazar Récord').setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await db.ref(`pending_records/${key}/notified`).set(true);
  });
}

// Interacciones con Comandos y Botones
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (command) {
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: 'Error al ejecutar comando.', ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;

    // --- ACEPTAR NIVEL ---
    if (customId.startsWith('accept_level_')) {
      const key = customId.replace('accept_level_', '');
      await interaction.deferUpdate();

      const pendingSnap = await db.ref(`pending_levels/${key}`).once('value');
      if (!pendingSnap.exists()) {
        return interaction.followUp({ content: '⚠️ Este nivel ya fue procesado.', ephemeral: true });
      }

      const levelData = pendingSnap.val();

      // Guardar nivel oficial
      await db.ref('levels').push().set({ ...levelData, createdAt: Date.now() });

      // Sumar +1 a Creador en Leaderboard
      if (levelData.creatorId) {
        const creatorRef = db.ref(`leaderboard/${levelData.creatorId}`);
        const creatorSnap = await creatorRef.once('value');
        const currentCreated = creatorSnap.exists() ? (creatorSnap.val().createdCount || 0) : 0;
        await creatorRef.update({
          name: levelData.creatorName || `User_${levelData.creatorId}`,
          createdCount: currentCreated + 1
        });
      }

      // Sumar +1 a Verificador en Leaderboard
      if (levelData.verifierId) {
        const verifierRef = db.ref(`leaderboard/${levelData.verifierId}`);
        const verifierSnap = await verifierRef.once('value');
        const currentVerified = verifierSnap.exists() ? (verifierSnap.val().verifiedCount || 0) : 0;
        await verifierRef.update({
          name: levelData.verifierName || `User_${levelData.verifierId}`,
          verifiedCount: currentVerified + 1
        });
      }

      await db.ref(`pending_levels/${key}`).remove();

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x57F287)
        .setTitle(`✅ Nivel Publicado y Leaderboard Actualizada`);
      await interaction.editReply({ embeds: [embed], components: [] });
    }

    // --- ACEPTAR RÉCORD ---
    if (customId.startsWith('accept_record_')) {
      const key = customId.replace('accept_record_', '');
      await interaction.deferUpdate();

      const pendingSnap = await db.ref(`pending_records/${key}`).once('value');
      if (!pendingSnap.exists()) {
        return interaction.followUp({ content: '⚠️ Este récord ya fue procesado.', ephemeral: true });
      }

      const recData = pendingSnap.val();
      const playerId = recData.userId || recData.playerName.toLowerCase().replace(/\s+/g, '_');

      // Puntos: 100 puntos si completó el 100%
      const pointsToAdd = recData.progress === 100 ? 100 : Math.floor(recData.progress * 0.5);

      const playerRef = db.ref(`leaderboard/${playerId}`);
      const playerSnap = await playerRef.once('value');
      const currentPoints = playerSnap.exists() ? (playerSnap.val().points || 0) : 0;

      await playerRef.update({
        name: recData.playerName,
        points: currentPoints + pointsToAdd,
        country: recData.country || 'N/A'
      });

      await db.ref(`pending_records/${key}`).remove();

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x57F287)
        .setTitle(`✅ Récord Aceptado: +${pointsToAdd} Puntos a ${recData.playerName}`);
      await interaction.editReply({ embeds: [embed], components: [] });
    }

    // --- RECHAZAR NIVEL ---
    if (customId.startsWith('reject_level_')) {
      const key = customId.replace('reject_level_', '');
      await interaction.deferUpdate();
      await db.ref(`pending_levels/${key}`).remove();
      await interaction.editReply({ content: '❌ Solicitud de nivel rechazada y eliminada.', embeds: [], components: [] });
    }

    // --- RECHAZAR RÉCORD ---
    if (customId.startsWith('reject_record_')) {
      const key = customId.replace('reject_record_', '');
      await interaction.deferUpdate();
      await db.ref(`pending_records/${key}`).remove();
      await interaction.editReply({ content: '❌ Solicitud de récord rechazada y eliminada.', embeds: [], components: [] });
    }
  }
});

client.once('ready', () => {
  console.log(`🤖 DASH Bot encendido y listo con sistema completo de Leaderboard`);
  listenForPendingItems();
});

client.login(process.env.DISCORD_TOKEN);