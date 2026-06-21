const db = require('../config/database');

const getAllCrews = async (req, res) => {
  try {
    const crews = await db('Crew')
      .select(
        'Crew.crew_id',
        'Crew.foreman_id',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name'
      )
      .count('Crew_Installer.installer_id as installer_count')
      .leftJoin('Foreman', 'Crew.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .leftJoin('Crew_Installer', 'Crew.crew_id', 'Crew_Installer.crew_id')
      .groupBy('Crew.crew_id', 'Crew.foreman_id', 'Foreman_User.last_name', 'Foreman_User.first_name')
      .orderBy('Crew.crew_id', 'asc');

    const formattedCrews = crews.map(crew => ({
      crew_id: crew.crew_id,
      foreman_id: crew.foreman_id,
      foreman_name: [crew.foreman_last_name, crew.foreman_first_name]
        .filter(Boolean)
        .join(' ') || 'Не назначен',
      installer_count: crew.installer_count
    }));

    res.status(200).json({
      status: 'success',
      data: formattedCrews
    });
  } catch (error) {
    console.error('Get all crews error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении списка бригад: ' + error.message
    });
  }
};

const createCrew = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { foremanId, installerIds = [] } = req.body;

    // Проверяем обязательные поля
    if (!foremanId) {
      await trx.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Не указан бригадир.'
      });
    }

    // Проверяем существование бригадира
    const foreman = await trx('Foreman')
      .where('foreman_id', foremanId)
      .first();

    if (!foreman) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Бригадир не найден.'
      });
    }

    // Создаем бригаду
    const [crewId] = await trx('Crew').insert({
      foreman_id: foremanId
    });

    // Добавляем монтажников
    if (installerIds.length > 0) {
      // Проверяем существование монтажников
      const installers = await trx('Installer')
        .whereIn('installer_id', installerIds)
        .select('installer_id');

      const existingInstallerIds = installers.map(i => i.installer_id);
      
      if (existingInstallerIds.length > 0) {
        const crewInstallers = existingInstallerIds.map(installerId => ({
          crew_id: crewId,
          installer_id: installerId
        }));

        await trx('Crew_Installer').insert(crewInstallers);
      }
    }

    await trx.commit();

    // Получаем созданную бригаду
    const crew = await db('Crew')
      .select(
        'Crew.*',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name'
      )
      .leftJoin('Foreman', 'Crew.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .where('Crew.crew_id', crewId)
      .first();

    // Получаем монтажников бригады
    const crewInstallers = await db('Crew_Installer')
      .select(
        'Installer.installer_id',
        'Installer_User.last_name',
        'Installer_User.first_name'
      )
      .join('Installer', 'Crew_Installer.installer_id', 'Installer.installer_id')
      .join('User as Installer_User', 'Installer.user_id', 'Installer_User.user_id')
      .where('Crew_Installer.crew_id', crewId);

    const result = {
      ...crew,
      foreman_name: [crew.foreman_last_name, crew.foreman_first_name]
        .filter(Boolean)
        .join(' '),
      installers: crewInstallers.map(i => ({
        installer_id: i.installer_id,
        name: [i.last_name, i.first_name].filter(Boolean).join(' ')
      }))
    };

    res.status(201).json({
      status: 'success',
      data: result,
      message: 'Бригада успешно создана'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Create crew error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при создании бригады: ' + error.message
    });
  }
};

const getCrewById = async (req, res) => {
  try {
    const { id } = req.params;

    const crew = await db('Crew')
      .select(
        'Crew.*',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name'
      )
      .leftJoin('Foreman', 'Crew.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .where('Crew.crew_id', id)
      .first();

    if (!crew) {
      return res.status(404).json({
        status: 'error',
        message: 'Бригада не найдена.'
      });
    }

    // Получаем монтажников - ДОБАВЛЯЕМ user_id
    const installers = await db('Crew_Installer')
      .select(
        'Installer.installer_id',
        'Installer.user_id',  // ДОБАВЛЕНО
        'Installer_User.last_name',
        'Installer_User.first_name',
        'Installer_User.email'
      )
      .join('Installer', 'Crew_Installer.installer_id', 'Installer.installer_id')
      .join('User as Installer_User', 'Installer.user_id', 'Installer_User.user_id')
      .where('Crew_Installer.crew_id', id);

    const result = {
      ...crew,
      foreman_name: [crew.foreman_last_name, crew.foreman_first_name]
        .filter(Boolean)
        .join(' '),
      installers: installers.map(i => ({
        installer_id: i.installer_id,
        user_id: i.user_id,  // ДОБАВЛЕНО
        last_name: i.last_name,
        first_name: i.first_name,
        email: i.email,
        full_name: [i.last_name, i.first_name].filter(Boolean).join(' ')
      }))
    };

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Get crew by id error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении бригады: ' + error.message
    });
  }
};

const addInstaller = async (req, res) => {
  try {
    const { id } = req.params;
    const { installerId } = req.body;

    if (!installerId) {
      return res.status(400).json({
        status: 'error',
        message: 'Не указан ID монтажника.'
      });
    }

    // Проверяем существование бригады
    const crew = await db('Crew').where('crew_id', id).first();
    if (!crew) {
      return res.status(404).json({
        status: 'error',
        message: 'Бригада не найдена.'
      });
    }

    // Проверяем существование монтажника
    const installer = await db('Installer').where('installer_id', installerId).first();
    if (!installer) {
      return res.status(404).json({
        status: 'error',
        message: 'Монтажник не найден.'
      });
    }

    // Проверяем, не добавлен ли уже
    const existing = await db('Crew_Installer')
      .where({
        crew_id: id,
        installer_id: installerId
      })
      .first();

    if (existing) {
      return res.status(400).json({
        status: 'error',
        message: 'Монтажник уже в бригаде.'
      });
    }

    await db('Crew_Installer').insert({
      crew_id: id,
      installer_id: installerId
    });

    res.status(201).json({
      status: 'success',
      message: 'Монтажник добавлен в бригаду.'
    });
  } catch (error) {
    console.error('Add installer error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при добавлении монтажника: ' + error.message
    });
  }
};

const removeInstaller = async (req, res) => {
  try {
    const { crewId, installerId } = req.params;

    const deleted = await db('Crew_Installer')
      .where({
        crew_id: crewId,
        installer_id: installerId
      })
      .del();

    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'Монтажник не найден в бригаде.'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Монтажник удален из бригады.'
    });
  } catch (error) {
    console.error('Remove installer error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении монтажника: ' + error.message
    });
  }
};

const deleteCrew = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;

    const crew = await trx('Crew').where('crew_id', id).first();
    if (!crew) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Бригада не найдена.'
      });
    }

    // Проверяем, есть ли связанные исполнители в заявках
    const performers = await trx('Performer')
      .where('crew_id', id)
      .first();

    if (performers) {
      // Проверяем, используются ли эти исполнители в заявках
      const linkedOrders = await trx('WorkOrder')
        .where('performer_id', performers.performer_id)
        .first();

      if (linkedOrders) {
        await trx.rollback();
        return res.status(400).json({
          status: 'error',
          message: 'Невозможно удалить бригаду, так как она связана с исполнителями, которые назначены на заявки.'
        });
      }

      // Если исполнители не используются в заявках, удаляем их
      await trx('Performer')
        .where('crew_id', id)
        .del();
    }

    // Удаляем связи с монтажниками
    await trx('Crew_Installer')
      .where('crew_id', id)
      .del();

    // Удаляем бригаду
    await trx('Crew')
      .where('crew_id', id)
      .del();

    await trx.commit();

    res.status(200).json({
      status: 'success',
      message: 'Бригада успешно удалена.'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Delete crew error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при удалении бригады: ' + error.message
    });
  }
};
const updateCrew = async (req, res) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;
    const { foremanId, installerIds = [] } = req.body;

    // Проверяем существование бригады
    const crew = await trx('Crew').where('crew_id', id).first();
    if (!crew) {
      await trx.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Бригада не найдена.'
      });
    }

    // Обновляем бригадира если указан
    if (foremanId) {
      const foreman = await trx('Foreman').where('foreman_id', foremanId).first();
      if (!foreman) {
        await trx.rollback();
        return res.status(404).json({
          status: 'error',
          message: 'Бригадир не найден.'
        });
      }
      
      await trx('Crew')
        .where('crew_id', id)
        .update({ foreman_id: foremanId });
    }

    // Обновляем монтажников
    if (installerIds !== undefined) {
      // Удаляем старые связи
      await trx('Crew_Installer')
        .where('crew_id', id)
        .del();

      // Добавляем новые связи
      if (installerIds.length > 0) {
        const installers = await trx('Installer')
          .whereIn('installer_id', installerIds)
          .select('installer_id');

        if (installers.length > 0) {
          const crewInstallers = installers.map(installer => ({
            crew_id: parseInt(id),
            installer_id: installer.installer_id
          }));

          await trx('Crew_Installer').insert(crewInstallers);
        }
      }
    }

    await trx.commit();

    // Получаем обновленную бригаду
    const updatedCrew = await db('Crew')
      .select(
        'Crew.crew_id',
        'Crew.foreman_id',
        'Foreman_User.last_name as foreman_last_name',
        'Foreman_User.first_name as foreman_first_name'
      )
      .leftJoin('Foreman', 'Crew.foreman_id', 'Foreman.foreman_id')
      .leftJoin('User as Foreman_User', 'Foreman.user_id', 'Foreman_User.user_id')
      .where('Crew.crew_id', id)
      .first();

    // Получаем монтажников
    const crewInstallers = await db('Crew_Installer')
      .select(
        'Installer.installer_id',
        'Installer_User.last_name',
        'Installer_User.first_name',
        'Installer_User.email'
      )
      .join('Installer', 'Crew_Installer.installer_id', 'Installer.installer_id')
      .join('User as Installer_User', 'Installer.user_id', 'Installer_User.user_id')
      .where('Crew_Installer.crew_id', id);

    const result = {
      crew_id: updatedCrew.crew_id,
      foreman_id: updatedCrew.foreman_id,
      foreman_name: [updatedCrew.foreman_last_name, updatedCrew.foreman_first_name]
        .filter(Boolean)
        .join(' ') || 'Не назначен',
      installers: crewInstallers.map(i => ({
        installer_id: i.installer_id,
        last_name: i.last_name,
        first_name: i.first_name,
        email: i.email,
        full_name: [i.last_name, i.first_name].filter(Boolean).join(' ')
      })),
      installer_count: crewInstallers.length
    };

    res.status(200).json({
      status: 'success',
      data: result,
      message: 'Бригада успешно обновлена'
    });
  } catch (error) {
    await trx.rollback();
    console.error('Update crew error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при обновлении бригады: ' + error.message
    });
  }
};

module.exports = {
  getAllCrews,
  getCrewById,
  createCrew,
  updateCrew,
  addInstaller,
  removeInstaller,
  deleteCrew
};