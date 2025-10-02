package com.example.washsimple.repo;

import com.example.washsimple.model.QueueEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface QueueEntryRepository extends JpaRepository<QueueEntry, Long> {
    List<QueueEntry> findByMachineIdOrderByCreatedAt(Long machineId);
}
